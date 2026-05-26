/**
 * Shadow-DOM widget: right-edge toggle + overlay panel + outline + pin form +
 * toast + recent-reports list. Pure DOM manipulation, zero deps.
 */
import * as Local from "./local-pins";
import { WIDGET_CSS } from "./styles";

export type WidgetCallbacks = {
  onToggleOverlay: () => void;
  onSubmitOverlay: (body: string, files: File[]) => Promise<void>;
};

export type PinFormCallbacks = {
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
};

export class Widget {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  private toggleEl: HTMLDivElement;
  private panelEl: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  private outlineEl: HTMLDivElement;
  private labelEl: HTMLDivElement;
  private pinFormEl: HTMLDivElement | null = null;
  private toastEl: HTMLDivElement | null = null;
  private overlayOpen = false;
  private bugModeOn = false;

  constructor(private cb: WidgetCallbacks) {
    this.host = document.createElement("quad-widget");
    this.host.style.cssText = "all: initial; position: static;";
    this.root = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = WIDGET_CSS;
    this.root.appendChild(style);

    this.toggleEl = this.makeToggle();
    this.panelEl = this.makePanel();
    this.bodyEl = this.panelEl.querySelector(".body")!;
    this.outlineEl = this.makeOutline();
    this.labelEl = this.makeOutlineLabel();

    this.root.appendChild(this.toggleEl);
    this.root.appendChild(this.panelEl);
    document.body.appendChild(this.host);
  }

  destroy(): void {
    this.host.remove();
  }

  // ---- Right-edge toggle ----------------------------------------------------

  private makeToggle(): HTMLDivElement {
    const d = document.createElement("div");
    d.className = "q-toggle";
    d.title = "Quad — report a bug (Cmd+Shift+Q)";
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      d.appendChild(dot);
    }
    d.addEventListener("click", () => this.cb.onToggleOverlay());
    return d;
  }

  setBugMode(on: boolean): void {
    this.bugModeOn = on;
    this.toggleEl.setAttribute("data-bug-mode", on ? "on" : "off");
    if (!on) this.hideOutline();
  }

  // ---- Overlay panel --------------------------------------------------------

  private makePanel(): HTMLDivElement {
    const p = document.createElement("div");
    p.className = "q-panel";
    p.setAttribute("data-open", "false");

    const header = document.createElement("header");
    const h1 = document.createElement("h1");
    h1.textContent = "Report a bug";
    const close = document.createElement("button");
    close.textContent = "×";
    close.title = "Close (Esc)";
    close.addEventListener("click", () => this.cb.onToggleOverlay());
    header.appendChild(h1);
    header.appendChild(close);

    const body = document.createElement("div");
    body.className = "body";
    body.innerHTML = `
      <p>To point at a specific element, use <strong>Bug Mode + Option/Alt+Click</strong>.</p>
      <p>This panel is for freeform reports. Drop videos/screenshots below or paste (Cmd+V).</p>
      <div class="drop" data-over="false">
        Drop a file here or click to select<br/>
        <small>Record with Cmd+Shift+5 (Mac) or Win+G (Windows), then drop here</small>
      </div>
      <input type="file" multiple accept="video/*,audio/*,image/*" style="display:none" />
      <textarea placeholder="What went wrong?"></textarea>
      <button class="primary">Submit</button>
      <p class="q-status" style="margin-top:10px; font-size:11px; color:var(--star-500);"></p>
      <section class="q-reports">
        <div class="header">
          <span class="label">Your reports</span>
          <span class="right">
            <button class="show-all" type="button" aria-pressed="false">Show all on this page</button>
            <span class="count"></span>
          </span>
        </div>
        <div class="list"></div>
      </section>
    `;
    p.appendChild(header);
    p.appendChild(body);

    this.wireOverlayBody(body);
    this.wireReportsList(body);
    return p;
  }

  // ---- Reports list -------------------------------------------------------

  private wireReportsList(body: HTMLDivElement): void {
    const section = body.querySelector<HTMLDivElement>(".q-reports")!;
    const countEl = section.querySelector<HTMLSpanElement>(".count")!;
    const listEl = section.querySelector<HTMLDivElement>(".list")!;
    const showAllBtn = section.querySelector<HTMLButtonElement>(".show-all")!;

    const render = () => {
      const all = Local.list();
      const route = location.pathname;
      // Group: pins on the current route surface first
      const hereOnly = all.filter((p) => p.route === route);
      const elsewhere = all.filter((p) => p.route !== route);
      countEl.textContent = String(all.length);

      // Master toggle reflects current state of pins on this route
      const allRevealed = hereOnly.length > 0 && hereOnly.every((p) => Local.isVisible(p.id));
      showAllBtn.setAttribute("aria-pressed", allRevealed ? "true" : "false");
      showAllBtn.textContent = allRevealed ? "Hide all" : "Show all on this page";
      showAllBtn.disabled = hereOnly.length === 0;
      showAllBtn.style.opacity = hereOnly.length === 0 ? "0.4" : "1";

      if (all.length === 0) {
        listEl.innerHTML = `<p class="empty">No reports yet. Pin an element or submit one above.</p>`;
        return;
      }

      const rowHtml = (p: Local.LocalPin, sameRoute: boolean) => {
        const visible = Local.isVisible(p.id);
        const eyeLabel = sameRoute
          ? visible ? "●" : "○"
          : "↗";
        const eyeTitle = sameRoute
          ? visible ? "Hide on page" : "Show on page"
          : `On ${p.route}`;
        const text = (p.body || "(no comment)").replace(/[<>]/g, "");
        return `
          <div class="item">
            <div class="body">
              <span class="text">${text}</span>
              <span class="meta">${p.selector.slice(0, 40)} · ${formatAgo(p.createdAt)}</span>
            </div>
            <button class="eye" data-id="${p.id}" data-same="${sameRoute ? "1" : "0"}"
                    title="${eyeTitle}" aria-pressed="${visible ? "true" : "false"}"
                    ${sameRoute ? "" : "disabled style=\"opacity:0.4\""}>
              ${eyeLabel}
            </button>
          </div>
        `;
      };

      listEl.innerHTML =
        hereOnly.map((p) => rowHtml(p, true)).join("") +
        elsewhere.map((p) => rowHtml(p, false)).join("");

      listEl.querySelectorAll<HTMLButtonElement>("button.eye").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          if (btn.dataset.same !== "1") {
            // navigate to that route to reveal
            const id = btn.dataset.id!;
            const pin = Local.list().find((p) => p.id === id);
            if (pin) {
              Local.setVisible(pin.id, true);
              location.href = pin.pageUrl;
            }
            return;
          }
          const id = btn.dataset.id!;
          Local.setVisible(id, !Local.isVisible(id));
        });
      });
    };

    showAllBtn.addEventListener("click", () => {
      const route = location.pathname;
      const here = Local.list().filter((p) => p.route === route);
      const allOn = here.length > 0 && here.every((p) => Local.isVisible(p.id));
      for (const p of here) Local.setVisible(p.id, !allOn);
    });

    render();
    Local.subscribe(render);
  }

  private wireOverlayBody(body: HTMLDivElement): void {
    const drop = body.querySelector<HTMLDivElement>(".drop")!;
    const fileInput = body.querySelector<HTMLInputElement>("input[type=file]")!;
    const ta = body.querySelector<HTMLTextAreaElement>("textarea")!;
    const btn = body.querySelector<HTMLButtonElement>(".primary")!;
    const status = body.querySelector<HTMLParagraphElement>(".q-status")!;

    let staged: File[] = [];
    const renderStaged = () => {
      status.textContent = staged.length
        ? `${staged.length} attached: ${staged.map((f) => f.name).join(", ")}`
        : "";
    };

    const acceptFiles = (files: FileList | File[]) => {
      const arr = Array.from(files);
      staged = staged.concat(arr);
      renderStaged();
    };

    drop.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files) acceptFiles(fileInput.files);
      fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach((ev) =>
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.setAttribute("data-over", "true");
      }),
    );
    ["dragleave", "drop"].forEach((ev) =>
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.setAttribute("data-over", "false");
      }),
    );
    drop.addEventListener("drop", (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (dt?.files?.length) acceptFiles(dt.files);
    });
    ta.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of items) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) acceptFiles(files);
    });

    btn.addEventListener("click", async () => {
      const body = ta.value.trim();
      if (!body && staged.length === 0) {
        status.textContent = "A short description or an attachment is required";
        status.className = "q-status error";
        return;
      }
      btn.disabled = true;
      status.className = "q-status";
      status.textContent = "Sending…";
      try {
        await this.cb.onSubmitOverlay(body, staged);
        ta.value = "";
        staged = [];
        renderStaged();
        status.textContent = "Sent";
        setTimeout(() => {
          status.textContent = "";
        }, 2000);
      } catch (err) {
        status.className = "q-status error";
        status.textContent = err instanceof Error ? err.message : "Send failed";
      } finally {
        btn.disabled = false;
      }
    });
  }

  setOverlayOpen(open: boolean): void {
    this.overlayOpen = open;
    this.panelEl.setAttribute("data-open", open ? "true" : "false");
  }

  isOverlayOpen(): boolean {
    return this.overlayOpen;
  }

  // ---- Hover outline --------------------------------------------------------

  private makeOutline(): HTMLDivElement {
    const o = document.createElement("div");
    o.className = "q-outline";
    o.style.display = "none";
    this.root.appendChild(o);
    return o;
  }

  private makeOutlineLabel(): HTMLDivElement {
    const l = document.createElement("div");
    l.className = "q-outline-label";
    l.style.display = "none";
    this.root.appendChild(l);
    return l;
  }

  showOutline(rect: DOMRect, label: string): void {
    this.outlineEl.style.display = "block";
    this.outlineEl.style.left = `${rect.left}px`;
    this.outlineEl.style.top = `${rect.top}px`;
    this.outlineEl.style.width = `${rect.width}px`;
    this.outlineEl.style.height = `${rect.height}px`;

    this.labelEl.style.display = "block";
    this.labelEl.textContent = label;
    const labelTop = rect.top - 22;
    this.labelEl.style.left = `${rect.left}px`;
    this.labelEl.style.top = `${labelTop < 0 ? rect.bottom + 4 : labelTop}px`;
  }

  hideOutline(): void {
    this.outlineEl.style.display = "none";
    this.labelEl.style.display = "none";
  }

  // ---- Floating pin form ----------------------------------------------------

  openPinForm(x: number, y: number, selector: string, cb: PinFormCallbacks): void {
    this.closePinForm();
    const form = document.createElement("div");
    form.className = "q-pin-form";
    form.innerHTML = `
      <div class="selector">${escapeHtml(selector)}</div>
      <textarea placeholder="What went wrong here? (Cmd/Ctrl+Enter to submit)"></textarea>
      <div class="actions">
        <button class="ghost" type="button">Cancel</button>
        <button class="submit" type="button">Submit</button>
      </div>
      <div class="status"></div>
    `;
    // Position: clamp to viewport
    const px = Math.min(x, window.innerWidth - 300);
    const py = Math.min(y, window.innerHeight - 200);
    form.style.left = `${Math.max(8, px)}px`;
    form.style.top = `${Math.max(8, py)}px`;
    this.root.appendChild(form);
    this.pinFormEl = form;

    const ta = form.querySelector<HTMLTextAreaElement>("textarea")!;
    const submitBtn = form.querySelector<HTMLButtonElement>(".submit")!;
    const cancelBtn = form.querySelector<HTMLButtonElement>(".ghost")!;
    const status = form.querySelector<HTMLDivElement>(".status")!;
    ta.focus();

    const doSubmit = async () => {
      const body = ta.value.trim();
      if (!body) {
        status.className = "status error";
        status.textContent = "A comment is required";
        return;
      }
      submitBtn.disabled = true;
      status.className = "status";
      status.textContent = "Sending…";
      try {
        await cb.onSubmit(body);
        this.closePinForm();
        this.toast("Pin saved");
      } catch (err) {
        status.className = "status error";
        status.textContent = err instanceof Error ? err.message : "Send failed";
        submitBtn.disabled = false;
      }
    };

    submitBtn.addEventListener("click", doSubmit);
    cancelBtn.addEventListener("click", () => {
      this.closePinForm();
      cb.onCancel();
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void doSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closePinForm();
        cb.onCancel();
      }
    });
  }

  closePinForm(): void {
    this.pinFormEl?.remove();
    this.pinFormEl = null;
  }

  // ---- Toast ----------------------------------------------------------------

  toast(text: string, ttlMs = 2200): void {
    this.toastEl?.remove();
    const t = document.createElement("div");
    t.className = "q-toast";
    t.textContent = text;
    this.root.appendChild(t);
    this.toastEl = t;
    setTimeout(() => {
      if (this.toastEl === t) {
        t.remove();
        this.toastEl = null;
      }
    }, ttlMs);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

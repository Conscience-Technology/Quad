/**
 * Reveal layer. When a pin is "visible" (per local-pins state), draws a
 * floating violet outline + comment popover on the element the user
 * originally pinned — only on the matching route. Re-attaches on scroll,
 * resize, and SPA route change.
 */
import * as Local from "./local-pins";

export class RevealLayer {
  private outlines = new Map<string, { outline: HTMLDivElement; tag: HTMLDivElement }>();
  private rafId: number | null = null;
  private mo: MutationObserver | null = null;
  private unsubLocal: () => void;
  private openPopover: HTMLDivElement | null = null;

  constructor(private shadow: ShadowRoot) {
    this.unsubLocal = Local.subscribe(() => this.schedule());
    window.addEventListener("scroll", this.schedule, true);
    window.addEventListener("resize", this.schedule);

    // Re-attach on SPA route change. We don't patch history here because
    // event-trail.ts already does that for capture sessions — instead we
    // just poll cheap state every 500ms (the panel is already open at that
    // point; cost is trivial).
    setInterval(() => this.schedule(), 800);

    // React to DOM updates
    this.mo = new MutationObserver(() => this.schedule());
    this.mo.observe(document.body, { childList: true, subtree: true });

    this.schedule();
  }

  destroy(): void {
    this.unsubLocal();
    window.removeEventListener("scroll", this.schedule, true);
    window.removeEventListener("resize", this.schedule);
    this.mo?.disconnect();
    for (const { outline, tag } of this.outlines.values()) {
      outline.remove();
      tag.remove();
    }
    this.outlines.clear();
  }

  private schedule = (): void => {
    if (this.rafId != null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  };

  private render(): void {
    const visible = new Set(Local.visibleIds());
    const route = location.pathname;
    const pins = Local.list().filter(
      (p) => visible.has(p.id) && p.route === route,
    );
    const wanted = new Set(pins.map((p) => p.id));

    // Drop outlines for pins no longer visible / on different route
    for (const [id, { outline, tag }] of this.outlines) {
      if (!wanted.has(id)) {
        outline.remove();
        tag.remove();
        this.outlines.delete(id);
      }
    }

    for (const pin of pins) {
      const el = this.findElement(pin);
      let entry = this.outlines.get(pin.id);
      if (!el) {
        if (entry) {
          entry.outline.style.display = "none";
          entry.tag.style.display = "none";
        }
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (!entry) {
        entry = this.makeOutline(pin);
        this.outlines.set(pin.id, entry);
      }
      const { outline, tag } = entry;
      outline.style.display = "block";
      outline.style.left = `${rect.left}px`;
      outline.style.top = `${rect.top}px`;
      outline.style.width = `${rect.width}px`;
      outline.style.height = `${rect.height}px`;

      tag.style.display = "block";
      const above = rect.top - 26 > 0;
      tag.style.left = `${rect.left}px`;
      tag.style.top = `${above ? rect.top - 26 : rect.bottom + 6}px`;
    }
  }

  private findElement(pin: Local.LocalPin): Element | null {
    // Try the stable selector first, fall back to the nth-child domPath.
    try {
      const a = document.querySelector(pin.selector);
      if (a) return a;
    } catch { /* invalid selector */ }
    if (pin.domPath) {
      try {
        const b = document.querySelector(pin.domPath);
        if (b) return b;
      } catch { /* ignore */ }
    }
    return null;
  }

  private makeOutline(pin: Local.LocalPin): { outline: HTMLDivElement; tag: HTMLDivElement } {
    const outline = document.createElement("div");
    outline.className = "q-reveal-outline";
    this.shadow.appendChild(outline);

    const tag = document.createElement("div");
    tag.className = "q-reveal-tag";
    tag.style.cursor = "pointer";
    tag.innerHTML = `
      <span class="dot">✦</span>
      <span class="body">${escapeHtml(pin.body.slice(0, 60))}</span>
      <button class="x" title="Hide">×</button>
    `;
    const x = tag.querySelector("button.x");
    x?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closePopover();
      Local.setVisible(pin.id, false);
    });
    tag.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePopover(pin, tag);
    });
    this.shadow.appendChild(tag);

    return { outline, tag };
  }

  // ---- click-popover (full body / metadata) -------------------------------

  private togglePopover(pin: Local.LocalPin, anchor: HTMLDivElement): void {
    if (this.openPopover && this.openPopover.dataset.id === pin.id) {
      this.closePopover();
      return;
    }
    this.closePopover();

    const pop = document.createElement("div");
    pop.className = "q-reveal-popover";
    pop.dataset.id = pin.id;
    pop.innerHTML = `
      <div class="head">
        <span class="who">your report</span>
        <span class="when">${formatAgo(pin.createdAt)}</span>
      </div>
      <p class="body">${escapeHtml(pin.body)}</p>
      <div class="meta">
        ${pin.componentPath ? `<div><span>component</span><code>${escapeHtml(pin.componentPath)}</code></div>` : ""}
        <div><span>selector</span><code>${escapeHtml(pin.selector)}</code></div>
        <div><span>route</span><code>${escapeHtml(pin.route)}</code></div>
      </div>
      <div class="actions">
        <button class="hide">Hide on page</button>
      </div>
    `;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 8;
    const left = Math.max(8, Math.min(window.innerWidth - 332, rect.left));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    this.shadow.appendChild(pop);
    this.openPopover = pop;

    pop.querySelector(".hide")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closePopover();
      Local.setVisible(pin.id, false);
    });

    // Dismiss on outside click
    const onDocClick = (e: MouseEvent) => {
      const path = (e.composedPath?.() ?? []) as EventTarget[];
      if (!path.includes(pop) && !path.includes(anchor)) {
        this.closePopover();
        document.removeEventListener("click", onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
  }

  private closePopover(): void {
    this.openPopover?.remove();
    this.openPopover = null;
  }
}

function formatAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

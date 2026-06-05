/**
 * Shadow-DOM widget: right-edge toggle + overlay panel + outline + pin form +
 * toast + recent-reports list. Pure DOM manipulation, zero deps.
 */
import * as Local from "./local-pins";
import { WIDGET_CSS } from "./styles";
import type { AzureDevOpsIdentity, AzureDevOpsMention } from "./types";

export type AzureSubmitOptions = {
  azureWorkItemIds?: number[];
  userStoryWorkItemId?: number;
  taskWorkItemId?: number;
  relatedWorkItemIds?: number[];
  azureMentions?: AzureDevOpsMention[];
};

export type WidgetCallbacks = {
  onToggleOverlay: () => void;
  getReporterName: () => string | undefined;
  onReporterNameChange: (name: string) => void;
  getAzureDevOpsPatStatus: () => Promise<{ configured: boolean; prefix?: string | null }>;
  onSaveAzureDevOpsPat: (pat: string) => Promise<{ configured: boolean; prefix?: string | null }>;
  onDeleteAzureDevOpsPat: () => Promise<void>;
  onSearchAzureDevOpsIdentities: (query: string) => Promise<AzureDevOpsIdentity[]>;
  onSubmitOverlay: (
    body: string,
    files: File[],
    options?: AzureSubmitOptions,
  ) => Promise<void>;
};

export type WidgetOptions = {
  azureDevOpsEnabled?: boolean;
};

export type PinFormCallbacks = {
  onSubmit: (body: string, options?: AzureSubmitOptions) => Promise<void>;
  onCancel: () => void;
};

export class Widget {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  private toggleEl: HTMLDivElement;
  private panelEl: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  private cursorStyle: HTMLStyleElement | null = null;
  private pinFormEl: HTMLDivElement | null = null;
  private toastEl: HTMLDivElement | null = null;
  private overlayOpen = false;
  private bugModeOn = false;

  constructor(
    private cb: WidgetCallbacks,
    private options: WidgetOptions = {},
  ) {
    this.host = document.createElement("quad-widget");
    this.host.style.cssText = "all: initial; position: static;";
    this.root = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = WIDGET_CSS;
    this.root.appendChild(style);

    this.toggleEl = this.makeToggle();
    this.panelEl = this.makePanel();
    this.bodyEl = this.panelEl.querySelector(".body")!;

    this.root.appendChild(this.toggleEl);
    this.root.appendChild(this.panelEl);
    document.body.appendChild(this.host);
  }

  destroy(): void {
    this.setBugMode(false);
    this.host.remove();
  }

  // ---- Right-edge toggle ----------------------------------------------------

  private makeToggle(): HTMLDivElement {
    const d = document.createElement("div");
    d.className = "q-toggle";
    d.title = "Quad - 증거 보내기 (Alt+Shift+Q)";
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      d.appendChild(dot);
    }
    d.addEventListener("click", () => this.cb.onToggleOverlay());
    return d;
  }

  setBugMode(on: boolean): void {
    if (this.bugModeOn === on) return;
    this.bugModeOn = on;
    this.toggleEl.setAttribute("data-bug-mode", on ? "on" : "off");
    this.setCrosshair(on);
  }

  /**
   * Toggle a global crosshair cursor by injecting / removing a tiny
   * stylesheet at the document head. Figma-style intent: the cursor itself
   * tells the reporter "click anywhere to drop a pin" — no expensive
   * hover preview, no whole-section outline.
   */
  private setCrosshair(on: boolean): void {
    if (on && !this.cursorStyle) {
      const s = document.createElement("style");
      s.setAttribute("data-quad", "cursor");
      s.textContent =
        "html, body, *, *::before, *::after { cursor: crosshair !important; }";
      document.head.appendChild(s);
      this.cursorStyle = s;
    } else if (!on && this.cursorStyle) {
      this.cursorStyle.remove();
      this.cursorStyle = null;
    }
  }

  // ---- Overlay panel --------------------------------------------------------

  private makePanel(): HTMLDivElement {
    const p = document.createElement("div");
    p.className = "q-panel";
    p.setAttribute("data-open", "false");

    const header = document.createElement("header");
    const h1 = document.createElement("h1");
    h1.textContent = "증거 보내기";
    const close = document.createElement("button");
    close.textContent = "×";
    close.title = "닫기 (Esc)";
    close.addEventListener("click", () => this.cb.onToggleOverlay());
    header.appendChild(h1);
    header.appendChild(close);

    const body = document.createElement("div");
    body.className = "body";
    body.innerHTML = `
      <p><strong>업무 항목에 증거를 보냅니다.</strong> Azure DevOps에서 논의는 계속하되, 현재 화면, 파일, 콘솔, 네트워크, 환경 정보를 함께 남길 때 사용하세요.</p>
      <p>특정 화면 요소를 지정하려면 <strong>버그 모드</strong>를 켠 뒤 요소를 클릭하세요.</p>
      <div class="q-reporter-setup" data-empty="true" data-editing="true">
        <div class="q-reporter-current">
          <span>작성자</span>
          <strong class="q-reporter-display"></strong>
          <button class="q-reporter-edit" type="button">변경</button>
        </div>
        <label class="q-field q-reporter-editor">
          <span>작성자 이름</span>
          <div class="q-reporter-row">
            <input class="q-reporter-name" type="text" autocomplete="name" placeholder="예: 이학준 TPM" />
            <button class="q-reporter-save" type="button">저장</button>
          </div>
          <small>한 번 저장하면 이 브라우저에서 계속 사용됩니다. Azure DevOps 댓글 본문에 제보자로 남습니다.</small>
        </label>
      </div>
      ${this.options.azureDevOpsEnabled ? `
      <div class="q-azure-pat" data-configured="false" data-editing="true">
        <div class="q-azure-pat-current">
          <span>Azure PAT</span>
          <strong class="q-azure-pat-label">미설정</strong>
          <button class="q-azure-pat-edit" type="button">수정</button>
        </div>
        <label class="q-field q-azure-pat-editor">
          <span>Azure DevOps PAT</span>
          <div class="q-reporter-row">
            <input class="q-azure-pat-input" type="password" autocomplete="off" placeholder="개인 Azure DevOps PAT" />
            <button class="q-azure-pat-save" type="button">저장</button>
          </div>
          <small>한 번 저장하면 서버에 암호화 저장됩니다. 상태 변경과 댓글은 이 PAT 계정으로 수행됩니다.</small>
          <button class="q-azure-pat-delete" type="button">저장된 PAT 삭제</button>
        </label>
        <p class="q-azure-pat-status"></p>
      </div>` : ""}
      <div class="drop" data-over="false">
        파일을 여기에 놓거나 클릭해서 선택<br/>
        <small>macOS는 ⌘⇧5, Windows는 Win+G로 녹화한 뒤 여기에 놓으세요</small>
      </div>
      <input type="file" multiple accept="video/*,audio/*,image/*" style="display:none" />
      ${this.options.azureDevOpsEnabled ? '<input class="q-user-story-work-item" type="number" inputmode="numeric" min="1" placeholder="User Story 번호 (선택)" />' : ""}
      ${this.options.azureDevOpsEnabled ? '<input class="q-task-work-item" type="number" inputmode="numeric" min="1" placeholder="Task 번호 (선택)" />' : ""}
      ${this.options.azureDevOpsEnabled ? '<input class="q-related-work-items" type="text" inputmode="numeric" placeholder="관련 Work Item 번호, 쉼표로 구분 (선택)" />' : ""}
      ${this.options.azureDevOpsEnabled ? `
      <div class="q-mention-box">
        <input class="q-mention-search" type="text" placeholder="@멘션할 사용자 이름 또는 이메일 검색" />
        <div class="q-mention-results"></div>
        <div class="q-mention-selected"></div>
      </div>` : ""}
      <textarea placeholder="무엇이 문제였나요?"></textarea>
      <button class="primary">보내기</button>
      <p class="q-status"></p>
      <section class="q-reports">
        <div class="header">
          <span class="label">내 제보</span>
          <span class="right">
            <button class="show-all" type="button" aria-pressed="false">이 페이지에서 모두 보기</button>
            <span class="count"></span>
          </span>
        </div>
        <div class="list"></div>
      </section>
    `;
    p.appendChild(header);
    p.appendChild(body);

    this.wireOverlayBody(body);
    this.syncReporterIdentity(body);
    if (this.options.azureDevOpsEnabled) {
      this.syncAzurePatSetup(body);
      this.wireAzureTargets(body);
      this.wireAzureMentions(body);
    }
    this.wireReportsList(body);
    return p;
  }

  private syncReporterIdentity(body: HTMLDivElement): void {
    const setup = body.querySelector<HTMLDivElement>(".q-reporter-setup");
    const reporterInput = body.querySelector<HTMLInputElement>("input.q-reporter-name");
    const display = body.querySelector<HTMLElement>(".q-reporter-display");
    const editBtn = body.querySelector<HTMLButtonElement>(".q-reporter-edit");
    const saveBtn = body.querySelector<HTMLButtonElement>(".q-reporter-save");
    if (!setup || !reporterInput || !display || !editBtn || !saveBtn) return;

    const render = (editing?: boolean) => {
      const name = this.cb.getReporterName()?.trim() ?? "";
      const isEmpty = !name;
      setup.dataset.empty = isEmpty ? "true" : "false";
      setup.dataset.editing = (editing ?? isEmpty) ? "true" : "false";
      display.textContent = name || "미설정";
      reporterInput.value = name;
    };

    const save = () => {
      const name = reporterInput.value.trim();
      this.cb.onReporterNameChange(name);
      render(!name);
      if (name) this.toast("작성자 이름이 저장되었습니다");
    };

    editBtn.addEventListener("click", () => {
      render(true);
      reporterInput.focus();
      reporterInput.select();
    });
    saveBtn.addEventListener("click", save);
    reporterInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
    });
    reporterInput.addEventListener("blur", (e) => {
      if (e.relatedTarget === saveBtn) return;
      if (setup.dataset.empty === "true" && reporterInput.value.trim()) save();
    });
    render();
  }

  private focusReporterSetup(): void {
    const setup = this.bodyEl.querySelector<HTMLDivElement>(".q-reporter-setup");
    const reporterInput = this.bodyEl.querySelector<HTMLInputElement>("input.q-reporter-name");
    if (!setup || !reporterInput) return;
    setup.dataset.editing = "true";
    this.setOverlayOpen(true);
    reporterInput.focus();
  }

  private syncAzurePatSetup(body: HTMLDivElement): void {
    const setup = body.querySelector<HTMLDivElement>(".q-azure-pat");
    const label = body.querySelector<HTMLElement>(".q-azure-pat-label");
    const editBtn = body.querySelector<HTMLButtonElement>(".q-azure-pat-edit");
    const saveBtn = body.querySelector<HTMLButtonElement>(".q-azure-pat-save");
    const deleteBtn = body.querySelector<HTMLButtonElement>(".q-azure-pat-delete");
    const input = body.querySelector<HTMLInputElement>(".q-azure-pat-input");
    const status = body.querySelector<HTMLParagraphElement>(".q-azure-pat-status");
    if (!setup || !label || !editBtn || !saveBtn || !deleteBtn || !input || !status) return;

    const render = (configured: boolean, prefix?: string | null, editing?: boolean) => {
      setup.dataset.configured = configured ? "true" : "false";
      setup.dataset.editing = (editing ?? !configured) ? "true" : "false";
      label.textContent = configured ? `저장됨 ${prefix ?? ""}`.trim() : "미설정";
      input.value = "";
    };

    void this.cb.getAzureDevOpsPatStatus()
      .then((res) => render(res.configured, res.prefix))
      .catch(() => {
        status.className = "q-azure-pat-status error";
        status.textContent = "Azure PAT 상태를 확인하지 못했습니다";
      });

    editBtn.addEventListener("click", () => {
      render(setup.dataset.configured === "true", label.textContent, true);
      input.focus();
    });
    saveBtn.addEventListener("click", async () => {
      const pat = input.value.trim();
      if (!pat) {
        status.className = "q-azure-pat-status error";
        status.textContent = "PAT를 입력해 주세요";
        return;
      }
      saveBtn.disabled = true;
      status.className = "q-azure-pat-status";
      status.textContent = "검증 및 저장 중…";
      try {
        const res = await this.cb.onSaveAzureDevOpsPat(pat);
        render(res.configured, res.prefix, false);
        status.textContent = "Azure PAT가 저장되었습니다";
      } catch (err) {
        status.className = "q-azure-pat-status error";
        status.textContent = err instanceof Error ? err.message : "Azure PAT 저장 실패";
      } finally {
        saveBtn.disabled = false;
      }
    });
    deleteBtn.addEventListener("click", async () => {
      deleteBtn.disabled = true;
      status.className = "q-azure-pat-status";
      status.textContent = "삭제 중…";
      try {
        await this.cb.onDeleteAzureDevOpsPat();
        render(false, null, true);
        status.textContent = "저장된 PAT를 삭제했습니다";
      } catch (err) {
        status.className = "q-azure-pat-status error";
        status.textContent = err instanceof Error ? err.message : "Azure PAT 삭제 실패";
      } finally {
        deleteBtn.disabled = false;
      }
    });
  }

  private wireAzureTargets(body: HTMLDivElement): void {
    const userStoryInput = body.querySelector<HTMLInputElement>("input.q-user-story-work-item");
    const taskInput = body.querySelector<HTMLInputElement>("input.q-task-work-item");
    const relatedInput = body.querySelector<HTMLInputElement>("input.q-related-work-items");
    if (!userStoryInput && !taskInput && !relatedInput) return;
    const saved = readSavedAzureTargets();
    if (userStoryInput && saved.userStoryWorkItemId) userStoryInput.value = String(saved.userStoryWorkItemId);
    if (taskInput && saved.taskWorkItemId) taskInput.value = String(saved.taskWorkItemId);
    if (relatedInput && saved.relatedWorkItemIds?.length) relatedInput.value = saved.relatedWorkItemIds.join(", ");
    const save = () => {
      const next = parseAzureTargets(userStoryInput?.value ?? "", taskInput?.value ?? "", relatedInput?.value ?? "");
      writeSavedAzureTargets(next);
    };
    userStoryInput?.addEventListener("change", save);
    taskInput?.addEventListener("change", save);
    relatedInput?.addEventListener("change", save);
  }

  private wireAzureMentions(body: HTMLDivElement): void {
    const input = body.querySelector<HTMLInputElement>("input.q-mention-search");
    const results = body.querySelector<HTMLDivElement>(".q-mention-results");
    const selected = body.querySelector<HTMLDivElement>(".q-mention-selected");
    if (!input || !results || !selected) return;
    const mentions: AzureDevOpsMention[] = [];
    const renderSelected = () => {
      selected.innerHTML = mentions.map((mention, index) => `
        <button class="q-mention-chip" type="button" data-index="${index}">
          ${escapeHtml(mention.displayName ?? mention.uniqueName ?? mention.id)} ×
        </button>
      `).join("");
      selected.querySelectorAll<HTMLButtonElement>("button.q-mention-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          const index = Number.parseInt(btn.dataset.index ?? "", 10);
          if (Number.isFinite(index)) mentions.splice(index, 1);
          renderSelected();
        });
      });
    };
    let timer: number | undefined;
    input.addEventListener("input", () => {
      if (timer) window.clearTimeout(timer);
      const query = input.value.trim();
      if (query.length < 2) {
        results.innerHTML = "";
        return;
      }
      timer = window.setTimeout(async () => {
        results.innerHTML = `<p>검색 중…</p>`;
        try {
          const found = await this.cb.onSearchAzureDevOpsIdentities(query);
          results.innerHTML = found.length
            ? found.map((identity) => `
              <button class="q-mention-result" type="button" data-id="${escapeHtml(identity.id)}" data-name="${escapeHtml(identity.displayName)}" data-unique="${escapeHtml(identity.uniqueName ?? "")}">
                <strong>${escapeHtml(identity.displayName)}</strong>
                ${identity.uniqueName ? `<span>${escapeHtml(identity.uniqueName)}</span>` : ""}
              </button>
            `).join("")
            : `<p>검색 결과가 없습니다</p>`;
          results.querySelectorAll<HTMLButtonElement>("button.q-mention-result").forEach((btn) => {
            btn.addEventListener("click", () => {
              const id = btn.dataset.id;
              if (!id || mentions.some((mention) => mention.id === id)) return;
              mentions.push({
                id,
                displayName: btn.dataset.name,
                uniqueName: btn.dataset.unique || undefined,
              });
              input.value = "";
              results.innerHTML = "";
              renderSelected();
            });
          });
        } catch (err) {
          results.innerHTML = `<p class="error">${escapeHtml(err instanceof Error ? err.message : "사용자 검색 실패")}</p>`;
        }
      }, 250);
    });
    (selected as HTMLDivElement & { quadMentions?: AzureDevOpsMention[] }).quadMentions = mentions;
    renderSelected();
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
      showAllBtn.textContent = allRevealed ? "모두 숨기기" : "이 페이지에서 모두 보기";
      showAllBtn.disabled = hereOnly.length === 0;
      showAllBtn.style.opacity = hereOnly.length === 0 ? "0.4" : "1";

      if (all.length === 0) {
        listEl.innerHTML = `<p class="empty">아직 제보가 없습니다. 요소를 지정하거나 위에서 증거를 보내세요.</p>`;
        return;
      }

      const rowHtml = (p: Local.LocalPin, sameRoute: boolean) => {
        const visible = Local.isVisible(p.id);
        const eyeLabel = sameRoute
          ? visible ? "●" : "○"
          : "↗";
        const eyeTitle = sameRoute
          ? visible ? "페이지에서 숨기기" : "페이지에서 보기"
          : `${p.route}에 있음`;
        const text = (p.body || "(코멘트 없음)").replace(/[<>]/g, "");
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
    const userStoryInput = body.querySelector<HTMLInputElement>("input.q-user-story-work-item");
    const taskInput = body.querySelector<HTMLInputElement>("input.q-task-work-item");
    const relatedWorkItemsInput = body.querySelector<HTMLInputElement>("input.q-related-work-items");
    const mentionSelected = body.querySelector<HTMLDivElement>(".q-mention-selected") as
      | (HTMLDivElement & { quadMentions?: AzureDevOpsMention[] })
      | null;
    const ta = body.querySelector<HTMLTextAreaElement>("textarea")!;
    const btn = body.querySelector<HTMLButtonElement>(".primary")!;
    const status = body.querySelector<HTMLParagraphElement>(".q-status")!;

    let staged: File[] = [];
    const renderStaged = () => {
      status.textContent = staged.length
        ? `${staged.length}개 첨부됨: ${staged.map((f) => f.name).join(", ")}`
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
      if (!this.cb.getReporterName()?.trim()) {
        status.textContent = "작성자 이름을 먼저 저장해 주세요";
        status.className = "q-status error";
        this.focusReporterSetup();
        return;
      }
      if (!body && staged.length === 0) {
        status.textContent = "설명이나 첨부 파일이 필요합니다";
        status.className = "q-status error";
        return;
      }
      const azureTargets = parseAzureTargets(
        userStoryInput?.value ?? "",
        taskInput?.value ?? "",
        relatedWorkItemsInput?.value ?? "",
      );
      if ((userStoryInput?.value.trim() || taskInput?.value.trim()) && (azureTargets.azureWorkItemIds?.length ?? 0) === 0) {
        status.textContent = "User Story 또는 Task 번호는 양수여야 합니다";
        status.className = "q-status error";
        return;
      }
      const relatedWorkItemIds = azureTargets.relatedWorkItemIds ?? [];
      if (relatedWorkItemsInput?.value.trim() && relatedWorkItemIds.length === 0) {
        status.textContent = "관련 Work Item 번호는 양수여야 합니다";
        status.className = "q-status error";
        return;
      }
      writeSavedAzureTargets(azureTargets);
      btn.disabled = true;
      status.className = "q-status";
      status.textContent = "전송 중…";
      try {
        await this.cb.onSubmitOverlay(body, staged, {
          ...azureTargets,
          azureMentions: mentionSelected?.quadMentions ?? [],
        });
        ta.value = "";
        staged = [];
        renderStaged();
        status.textContent = "전송 완료";
        setTimeout(() => {
          status.textContent = "";
        }, 2000);
      } catch (err) {
        status.className = "q-status error";
        status.textContent = err instanceof Error ? err.message : "전송 실패";
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

  // ---- Floating pin form ----------------------------------------------------

  openPinForm(x: number, y: number, selector: string, cb: PinFormCallbacks): void {
    this.closePinForm();
    const form = document.createElement("div");
    form.className = "q-pin-form";
    const savedTargets = readSavedAzureTargets();
    form.innerHTML = `
      <div class="selector">${escapeHtml(selector)}</div>
      ${this.options.azureDevOpsEnabled ? `
        <div class="q-pin-azure">
          <input class="q-pin-user-story" type="number" inputmode="numeric" min="1" placeholder="User Story 번호 (선택)" value="${savedTargets.userStoryWorkItemId ?? ""}" />
          <input class="q-pin-task" type="number" inputmode="numeric" min="1" placeholder="Task 번호 (선택)" value="${savedTargets.taskWorkItemId ?? ""}" />
        </div>
      ` : ""}
      <textarea placeholder="여기서 무엇이 문제였나요? (Cmd/Ctrl+Enter로 제출)"></textarea>
      <div class="actions">
        <button class="ghost" type="button">취소</button>
        <button class="submit" type="button">보내기</button>
      </div>
      <div class="status"></div>
    `;
    this.root.appendChild(form);
    this.pinFormEl = form;
    // Position after mounting so responsive CSS width/height are measured.
    const rect = form.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - rect.width - 8);
    const py = Math.min(y, window.innerHeight - rect.height - 8);
    form.style.left = `${Math.max(8, px)}px`;
    form.style.top = `${Math.max(8, py)}px`;

    const ta = form.querySelector<HTMLTextAreaElement>("textarea")!;
    const submitBtn = form.querySelector<HTMLButtonElement>(".submit")!;
    const cancelBtn = form.querySelector<HTMLButtonElement>(".ghost")!;
    const status = form.querySelector<HTMLDivElement>(".status")!;
    const userStoryInput = form.querySelector<HTMLInputElement>("input.q-pin-user-story");
    const taskInput = form.querySelector<HTMLInputElement>("input.q-pin-task");
    ta.focus();

    const doSubmit = async () => {
      const body = ta.value.trim();
      if (!this.cb.getReporterName()?.trim()) {
        status.className = "status error";
        status.textContent = "작성자 이름을 먼저 저장해 주세요";
        this.focusReporterSetup();
        return;
      }
      if (!body) {
        status.className = "status error";
        status.textContent = "코멘트가 필요합니다";
        return;
      }
      const azureTargets = parseAzureTargets(userStoryInput?.value ?? "", taskInput?.value ?? "", "");
      if ((userStoryInput?.value.trim() || taskInput?.value.trim()) && (azureTargets.azureWorkItemIds?.length ?? 0) === 0) {
        status.className = "status error";
        status.textContent = "User Story 또는 Task 번호는 양수여야 합니다";
        return;
      }
      writeSavedAzureTargets({ ...readSavedAzureTargets(), ...azureTargets });
      submitBtn.disabled = true;
      status.className = "status";
      status.textContent = "전송 중…";
      try {
        await cb.onSubmit(body, azureTargets);
        this.closePinForm();
        this.toast("핀 저장됨");
      } catch (err) {
        status.className = "status error";
        status.textContent = err instanceof Error ? err.message : "전송 실패";
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

function parseWorkItemList(raw: string): number[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((part) => Number.parseInt(part.trim().replace(/^#/, ""), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.trunc(n)),
    ),
  ).slice(0, 12);
}

const AZURE_TARGETS_KEY = "quad.azure_targets.v1";

function parseAzureTargets(userStoryRaw: string, taskRaw: string, relatedRaw: string): AzureSubmitOptions {
  const userStoryWorkItemId = parseSingleWorkItem(userStoryRaw);
  const taskWorkItemId = parseSingleWorkItem(taskRaw);
  const relatedWorkItemIds = parseWorkItemList(relatedRaw);
  const azureWorkItemIds = Array.from(
    new Set([userStoryWorkItemId, taskWorkItemId].filter((n): n is number => Boolean(n))),
  );
  return {
    azureWorkItemIds,
    userStoryWorkItemId,
    taskWorkItemId,
    relatedWorkItemIds,
  };
}

function parseSingleWorkItem(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/^#/, "");
  if (!trimmed) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

function readSavedAzureTargets(): AzureSubmitOptions {
  try {
    const raw = localStorage.getItem(AZURE_TARGETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AzureSubmitOptions;
    return {
      userStoryWorkItemId: typeof parsed.userStoryWorkItemId === "number" ? parsed.userStoryWorkItemId : undefined,
      taskWorkItemId: typeof parsed.taskWorkItemId === "number" ? parsed.taskWorkItemId : undefined,
      azureWorkItemIds: Array.isArray(parsed.azureWorkItemIds) ? parsed.azureWorkItemIds.filter((n) => typeof n === "number") : undefined,
      relatedWorkItemIds: Array.isArray(parsed.relatedWorkItemIds) ? parsed.relatedWorkItemIds.filter((n) => typeof n === "number") : undefined,
    };
  } catch {
    return {};
  }
}

function writeSavedAzureTargets(targets: AzureSubmitOptions): void {
  try {
    localStorage.setItem(AZURE_TARGETS_KEY, JSON.stringify({
      userStoryWorkItemId: targets.userStoryWorkItemId,
      taskWorkItemId: targets.taskWorkItemId,
      azureWorkItemIds: targets.azureWorkItemIds,
      relatedWorkItemIds: targets.relatedWorkItemIds,
    }));
  } catch {
    /* ignore storage failures */
  }
}

function formatAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

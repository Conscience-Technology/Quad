/**
 * @quad/sdk — public entry. The QuadApi singleton holds the install / teardown
 * lifecycle and exposes the imperative surface (open, identify, report).
 */
import { Api } from "./api";
import { BugMode } from "./bug-mode";
import { CaptureSession, type CaptureMode } from "./capture";
import { installConsoleTap } from "./console-tap";
import * as Local from "./local-pins";
import { installNetworkTap } from "./network-tap";
import { buildPin } from "./pin";
import { RevealLayer } from "./reveal";
import { matchesKey, parse } from "./shortcuts";
import { Widget, type AzureSubmitOptions } from "./widget";
import {
  Ring,
  isBrowser,
  selectorFor,
  timezone,
} from "./util";
import type {
  ConsoleEntry,
  NetworkEntry,
  PinPayload,
  QuadOptions,
  ReportMeta,
} from "./types";

export type { QuadOptions } from "./types";

const VERSION = "0.0.0";
const ANON_COOKIE = "quad_anon";
const REPORTER_NAME_KEY = "quad.reporter_name.v1";
const AZURE_TARGETS_KEY = "quad.azure_targets.v1";

class QuadApi {
  private opts: Required<Pick<QuadOptions, "apiKey" | "endpoint">> &
    Omit<QuadOptions, "apiKey" | "endpoint"> = {
    apiKey: "",
    endpoint: "",
  };
  private api?: Api;
  private widget?: Widget;
  private bugMode?: BugMode;
  private capture?: CaptureSession;
  private reveal?: RevealLayer;
  private optKey: "Option" | "Alt" = "Alt";
  private user?: QuadOptions["user"];
  private context: Record<string, unknown> = {};
  private consoleRing = new Ring<ConsoleEntry>(50);
  private networkRing = new Ring<NetworkEntry>(20);
  private cleanupFns: Array<() => void> = [];
  private installed = false;
  private pendingPointerResolve: ((target: PinPayload) => void) | null = null;
  private pendingPointerReject: (() => void) | null = null;

  init(opts: QuadOptions): void {
    if (!isBrowser() || this.installed) return;
    this.opts = { endpoint: "", ...opts };
    this.user = opts.user;
    this.api = new Api({
      apiKey: opts.apiKey,
      endpoint: opts.endpoint ?? "",
      version: VERSION,
    });

    // Console + network taps (default on)
    if (opts.captureConsole !== false) {
      this.cleanupFns.push(installConsoleTap(this.consoleRing));
    }
    if (opts.captureNetwork !== false) {
      this.cleanupFns.push(
        installNetworkTap(this.networkRing, ["/api/ingest/", "/api/trpc"]),
      );
    }

    // Shortcuts. `alt+shift+*` is an empty chord on macOS/Windows/Linux —
    // the previous `mod+shift+*` defaults collided with browser shortcuts
    // (Cmd+Shift+B = Chrome bookmarks bar, Cmd+Shift+R = force reload,
    // Cmd+Shift+Q = quit Chrome on macOS).
    const shortcuts = {
      overlay: parse(opts.shortcut?.overlay ?? "alt+shift+q"),
      capture: parse(opts.shortcut?.capture ?? "alt+shift+r"),
      voice: parse(opts.shortcut?.voice ?? "alt+shift+v"),
    };

    // Widget + bug mode
    this.widget = new Widget(
      {
        onToggleOverlay: () => this.toggleOverlay(),
        onRequestPointerTarget: () => this.requestPointerTarget(),
        onClearPointerTarget: () => this.clearPointerTarget(),
        getReporterName: () => this.reporterName(),
        onReporterNameChange: (name) => this.setReporterName(name),
        getAzureDevOpsPatStatus: () => this.getAzureDevOpsPatStatus(),
        onSaveAzureDevOpsPat: (pat) => this.saveAzureDevOpsPat(pat),
        onDeleteAzureDevOpsPat: () => this.deleteAzureDevOpsPat(),
        onSubmitOverlay: (body, files, options) => this.submitOverlay(body, files, options),
      },
      {
        azureDevOpsEnabled: opts.azureDevOps?.enabled === true,
        mentionUsers: opts.azureDevOps?.mentionUsers ?? [],
      },
    );
    this.bugMode = new BugMode(this.widget, this.widget.host, {
      onPin: (el) => this.completePointerTarget(el),
    });
    // Mac users see ⌥ / Option, Windows + Linux see Alt. Same physical key.
    this.optKey = /Mac|iPhone|iPad/i.test(navigator?.platform ?? "") ? "Option" : "Alt";
    this.reveal = new RevealLayer(this.widget.root);

    // Cross-device sync: pull this reporter's own pins from the server,
    // merge into localStorage, then apply showPins policy.
    void this.bootstrapPins();
    this.capture = new CaptureSession(this.widget.root, this.widget.host, {
      onUploadVideo: (b) => this.api!.uploadBlob(b, `capture-${Date.now()}.webm`, "video"),
      onUploadAudio: (b) => this.api!.uploadBlob(b, `voice-${Date.now()}.webm`, "audio"),
      onUploadTrail: (json) =>
        this.api!.uploadBlob(
          new Blob([json], { type: "application/json" }),
          `trail-${Date.now()}.json`,
          "screenshot", // trail.json uses the screenshot kind for storage; preprocessor distinguishes by mime
        ),
      onComplete: async (input) => {
        await this.api!.createSession({
          title: input.title,
          body: "(캡처 세션)",
          meta: this.snapshotMeta(this.savedAzureContext()),
          reporter: this.reporter(),
          reporterAnonKey: this.ensureAnonKey(),
          attachments: input.attachments,
        });
        this.widget?.toast(`증거 저장 완료 · ${Math.round(input.durationMs / 1000)}초`);
      },
      onPin: () => {
        void this.requestPointerTarget();
      },
    });

    // Global keydown
    const onKey = (e: KeyboardEvent) => {
      const shortcut =
        matchesKey(shortcuts.overlay, e) ||
        matchesKey(shortcuts.capture, e) ||
        matchesKey(shortcuts.voice, e);
      if (shortcut && e.repeat) {
        e.preventDefault();
        return;
      }
      if (matchesKey(shortcuts.overlay, e)) {
        e.preventDefault();
        this.toggleOverlay();
      } else if (matchesKey(shortcuts.capture, e)) {
        e.preventDefault();
        if (this.capture?.isActive()) {
          void this.capture.stop();
        } else {
          this.askCaptureMode().then((mode) => {
            if (mode) void this.startRecord({ mode });
          });
        }
      } else if (matchesKey(shortcuts.voice, e)) {
        e.preventDefault();
        if (this.capture?.isActive()) {
          void this.capture.stop();
        } else {
          void this.startRecord({ mode: "mic-only" });
        }
      } else if (e.key === "Escape") {
        if (this.capture?.isActive()) void this.capture.stop();
        else if (this.bugMode?.isOn()) this.cancelPointerTarget();
        else if (this.widget?.isOverlayOpen()) this.toggleOverlay();
      }
    };
    document.addEventListener("keydown", onKey, true);
    this.cleanupFns.push(() => document.removeEventListener("keydown", onKey, true));

    this.installed = true;
  }

  close(): void {
    this.reveal?.destroy();
    this.bugMode?.destroy();
    this.widget?.destroy();
    for (const fn of this.cleanupFns) {
      try { fn(); } catch { /* ignore */ }
    }
    this.cleanupFns = [];
    this.installed = false;
  }

  identify(user: { id: string; email?: string; name?: string }): void {
    this.user = user;
    if (user.name) this.setReporterName(user.name);
  }

  setContext(ctx: Record<string, unknown>): void {
    this.context = { ...this.context, ...ctx };
  }

  open(): void {
    if (!this.widget) return;
    if (!this.widget.isOverlayOpen()) this.widget.setOverlayOpen(true);
  }

  close_(): void {
    if (this.widget?.isOverlayOpen()) this.widget.setOverlayOpen(false);
  }

  /** Async, no-throw report used by host code. */
  async report(input: { title: string; body?: string }): Promise<void> {
    if (!this.api) return;
    try {
      await this.api.createSession({
        title: input.title,
        body: input.body ?? "",
        meta: this.snapshotMeta(),
        reporter: this.reporter(),
        reporterAnonKey: this.ensureAnonKey(),
      });
    } catch (err) {
      // Fail silent — never break the host app.
      if (typeof console !== "undefined") {
        console.warn("[quad] report failed:", err);
      }
    }
  }

  // ---- Capture session ------------------------------------------------------

  async startRecord(opts: { mode?: CaptureMode } = {}): Promise<void> {
    if (!this.capture) return;
    const mode: CaptureMode = opts.mode ?? "screen+mic";
    try {
      await this.capture.start(mode);
      this.widget?.toast(mode === "screen+mic" ? "화면 녹화 + 음성 기록 시작" : "음성 기록 시작");
    } catch (err) {
      this.widget?.toast(err instanceof Error ? err.message : "기록을 시작하지 못했습니다");
    }
  }

  async stopRecord(): Promise<void> {
    if (!this.capture?.isActive()) return;
    await this.capture.stop();
  }

  /** One-shot on init: fetch this reporter's pins from the server, merge into
   * localStorage (so panel reflects them on a fresh device / private window),
   * then apply the showPins policy. Fail silent — never block boot. */
  private async bootstrapPins(): Promise<void> {
    if (!this.api) return;
    try {
      const anon = this.ensureAnonKey();
      const res = await this.api.listMyPins({
        reporterAnon: anon,
        reporterId: this.user?.id,
        limit: 50,
      });
      const existing = new Set(Local.list().map((p) => p.id));
      for (const p of res.pins) {
        if (existing.has(p.id)) continue;
        if (!p.selector) continue;
        Local.add({
          id: p.id,
          createdAt: new Date(p.createdAt).getTime(),
          route: p.route ?? "/",
          pageUrl: p.pageUrl ?? "",
          selector: p.selector,
          domPath: p.domPath ?? undefined,
          componentPath: p.componentPath ?? undefined,
          body: p.body,
        });
      }
    } catch {
      /* fail silent — local pins still work */
    }

    // Apply showPins policy after server merge.
    const policy = this.opts.showPins ?? "off";
    if (policy === "off") return;
    const route = location.pathname;
    for (const p of Local.list()) {
      const matches = policy === "self-all" || p.route === route;
      if (matches && !Local.isVisible(p.id)) Local.setVisible(p.id, true);
    }
  }

  /** Minimal native confirm so we don't ship a custom modal just for this. */
  private async askCaptureMode(): Promise<CaptureMode | null> {
    if (typeof confirm === "function") {
      return confirm("화면과 음성을 함께 녹화할까요? 취소를 누르면 음성만 녹음합니다.")
        ? "screen+mic"
        : "mic-only";
    }
    return "screen+mic";
  }

  // ---- Internal -------------------------------------------------------------

  private toggleOverlay(): void {
    if (!this.widget) return;
    this.widget.setOverlayOpen(!this.widget.isOverlayOpen());
  }

  private requestPointerTarget(): Promise<PinPayload> {
    if (!this.bugMode || !this.widget) return Promise.reject(new Error("Quad가 초기화되지 않았습니다"));
    this.cancelPointerTarget();
    this.widget.setOverlayOpen(true);
    this.bugMode.setOn(true);
    this.widget.toast("문제 위치로 지정할 화면 요소를 클릭하세요");
    return new Promise((resolve, reject) => {
      this.pendingPointerResolve = resolve;
      this.pendingPointerReject = () => reject(new Error("문제 위치 지정이 취소되었습니다"));
    });
  }

  private completePointerTarget(el: Element): void {
    const target = buildPin(el, "");
    this.pendingPointerResolve?.(target);
    this.pendingPointerResolve = null;
    this.pendingPointerReject = null;
    this.widget?.toast("문제 위치가 지정되었습니다");
  }

  private cancelPointerTarget(): void {
    if (this.bugMode?.isOn()) this.bugMode.setOn(false);
    this.pendingPointerReject?.();
    this.pendingPointerResolve = null;
    this.pendingPointerReject = null;
  }

  private clearPointerTarget(): void {
    this.cancelPointerTarget();
    this.bugMode?.clearSelection();
  }

  private openPinForm(el: Element, x: number, y: number): void {
    if (!this.widget) return;
    this.widget.openPinForm(x, y, selectorFor(el), {
      onSubmit: async (body, options) => {
        if (!this.api) return;
        const pin = buildPin(el, body);
        const result = await this.api.createPin({
          pin,
          meta: this.snapshotMeta(this.azureContext(options)),
          reporter: this.reporter(),
          reporterAnonKey: this.ensureAnonKey(),
        });
        // Cache locally so the reporter can find / reveal it later, but
        // don't show it on the page until they toggle it from the panel.
        Local.add({
          id: result.id,
          createdAt: Date.now(),
          route: pin.route,
          pageUrl: pin.pageUrl,
          selector: pin.selector,
          domPath: pin.domPath,
          componentPath: pin.componentPath,
          body: pin.body,
        });
      },
      onCancel: () => {
        /* close handled by Widget */
      },
    });
  }

  private async submitOverlay(
    body: string,
    files: File[],
    options: AzureSubmitOptions = {},
  ): Promise<void> {
    if (!this.api) throw new Error("Quad가 초기화되지 않았습니다");
    const attachments: Array<{
      key: string;
      mime: string;
      sizeBytes: number;
      kind: "video" | "audio" | "screenshot";
    }> = [];
    for (const f of files) {
      const kind: "video" | "audio" | "screenshot" = f.type.startsWith("video/")
        ? "video"
        : f.type.startsWith("audio/")
          ? "audio"
          : "screenshot";
      const up = await this.api.uploadFile(f, kind);
      attachments.push({ ...up, kind });
    }
    const title = body.slice(0, 80) || "(첨부 증거)";
    const meta = this.snapshotMeta(this.azureContext(options));
    const result = await this.api.createSession({
      title,
      body,
      meta,
      reporter: this.reporter(),
      reporterAnonKey: this.ensureAnonKey(),
      attachments,
      target: options.target,
    });
    if (options.target) {
      Local.add({
        id: result.id,
        createdAt: Date.now(),
        route: options.target.route,
        pageUrl: options.target.pageUrl,
        selector: options.target.selector,
        domPath: options.target.domPath,
        componentPath: options.target.componentPath,
        body,
      });
    }
  }

  private reporter(): QuadOptions["user"] | undefined {
    const name = this.reporterName();
    if (this.user) return name ? { ...this.user, name } : this.user;
    return name ? { id: this.ensureAnonKey(), name } : undefined;
  }

  private reporterName(): string | undefined {
    const explicit = this.user?.name?.trim();
    if (explicit) return explicit;
    try {
      return localStorage.getItem(REPORTER_NAME_KEY)?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private setReporterName(name: string): void {
    const normalized = name.trim().slice(0, 120);
    if (this.user) this.user = { ...this.user, name: normalized || this.user.name };
    try {
      if (normalized) localStorage.setItem(REPORTER_NAME_KEY, normalized);
      else localStorage.removeItem(REPORTER_NAME_KEY);
    } catch {
      /* ignore storage failures */
    }
  }

  private async getAzureDevOpsPatStatus(): Promise<{ configured: boolean; prefix?: string | null }> {
    if (!this.api) return { configured: false };
    return this.api.getAzureDevOpsPatStatus(this.ensureAnonKey());
  }

  private async saveAzureDevOpsPat(pat: string): Promise<{ configured: boolean; prefix?: string | null }> {
    if (!this.api) throw new Error("Quad가 초기화되지 않았습니다");
    return this.api.saveAzureDevOpsPat(this.ensureAnonKey(), pat);
  }

  private async deleteAzureDevOpsPat(): Promise<void> {
    if (!this.api) return;
    await this.api.deleteAzureDevOpsPat(this.ensureAnonKey());
  }

  private async searchAzureDevOpsIdentities(query: string) {
    if (!this.api) return [];
    const res = await this.api.searchAzureDevOpsIdentities(this.ensureAnonKey(), query);
    return res.identities;
  }

  private azureContext(options: AzureSubmitOptions = {}): Record<string, unknown> {
    return {
      azureWorkItemIds: options.azureWorkItemIds,
      userStoryWorkItemId: options.userStoryWorkItemId,
      taskWorkItemId: options.taskWorkItemId,
      azureMentions: options.azureMentions,
      azureMentionEmails: options.azureMentionEmails,
    };
  }

  private savedAzureContext(): Record<string, unknown> {
    try {
      const raw = localStorage.getItem(AZURE_TARGETS_KEY);
      if (!raw) return {};
      return this.azureContext(JSON.parse(raw) as AzureSubmitOptions);
    } catch {
      return {};
    }
  }

  private snapshotMeta(extraContext: Record<string, unknown> = {}): ReportMeta {
    return {
      userAgent: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio || 1,
      timezone: timezone(),
      sdkVersion: VERSION,
      commitSha: this.opts.commitSha,
      consoleLogs: this.consoleRing.snapshot(),
      networkErrors: this.networkRing.snapshot(),
      customContext: {
        pageUrl: location.href,
        path: location.pathname,
        ...this.context,
        ...extraContext,
      },
    };
  }

  /** Stable anon identifier per-browser, stored as a host-app cookie. */
  private ensureAnonKey(): string {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/(?:^|; )quad_anon=([^;]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
    const key = `anon_${cryptoRandom(16)}`;
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${ANON_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=${oneYear}; samesite=lax`;
    return key;
  }
}

function cryptoRandom(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const quad = new QuadApi();

/**
 * @quad/sdk — public entry. The QuadApi singleton holds the install / teardown
 * lifecycle and exposes the imperative surface (open, identify, report).
 */
import { Api } from "./api";
import { BugMode } from "./bug-mode";
import { CaptureSession, type CaptureMode } from "./capture";
import { installConsoleTap } from "./console-tap";
import { installNetworkTap } from "./network-tap";
import { buildPin } from "./pin";
import { matchesKey, parse } from "./shortcuts";
import { Widget } from "./widget";
import {
  Ring,
  isBrowser,
  selectorFor,
  timezone,
} from "./util";
import type {
  ConsoleEntry,
  NetworkEntry,
  QuadOptions,
  ReportMeta,
} from "./types";

export type { QuadOptions } from "./types";

const VERSION = "0.0.0";
const ANON_COOKIE = "quad_anon";

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
  private user?: QuadOptions["user"];
  private context: Record<string, unknown> = {};
  private consoleRing = new Ring<ConsoleEntry>(50);
  private networkRing = new Ring<NetworkEntry>(20);
  private cleanupFns: Array<() => void> = [];
  private installed = false;

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

    // Shortcuts
    const shortcuts = {
      bugMode: parse(opts.shortcut?.bugMode ?? "mod+shift+b"),
      pin: parse(opts.shortcut?.pin ?? "alt+click"),
      overlay: parse(opts.shortcut?.overlay ?? "mod+shift+q"),
      capture: parse(opts.shortcut?.capture ?? "mod+shift+r"),
      voice: parse(opts.shortcut?.voice ?? "mod+shift+v"),
    };

    // Widget + bug mode
    this.widget = new Widget({
      onToggleOverlay: () => this.toggleOverlay(),
      onSubmitOverlay: (body, files) => this.submitOverlay(body, files),
    });
    this.bugMode = new BugMode(this.widget, this.widget.host, shortcuts.pin, {
      onPin: (el, x, y) => this.openPinForm(el, x, y),
    });
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
          body: "(Capture session)",
          meta: this.snapshotMeta(),
          reporter: this.user,
          reporterAnonKey: this.ensureAnonKey(),
          attachments: input.attachments,
        });
        this.widget?.toast(`Capture saved · ${Math.round(input.durationMs / 1000)}s`);
      },
      onPin: () => {
        // Toggle bug mode on so the next Option+Click captures the pin; the
        // pin is then attached to the bug_report independently from the capture.
        if (!this.bugMode?.isOn()) this.toggleBugMode();
        this.widget?.toast("Option+Click an element to pin it");
      },
    });

    // Global keydown
    const onKey = (e: KeyboardEvent) => {
      if (matchesKey(shortcuts.bugMode, e)) {
        e.preventDefault();
        this.toggleBugMode();
      } else if (matchesKey(shortcuts.overlay, e)) {
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
        else if (this.bugMode?.isOn()) this.toggleBugMode();
        else if (this.widget?.isOverlayOpen()) this.toggleOverlay();
      }
    };
    document.addEventListener("keydown", onKey, true);
    this.cleanupFns.push(() => document.removeEventListener("keydown", onKey, true));

    this.installed = true;
  }

  close(): void {
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
        reporter: this.user,
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
      this.widget?.toast(mode === "screen+mic" ? "Recording + STT started" : "Voice recording started");
    } catch (err) {
      this.widget?.toast(err instanceof Error ? err.message : "Failed to start recording");
    }
  }

  async stopRecord(): Promise<void> {
    if (!this.capture?.isActive()) return;
    await this.capture.stop();
  }

  /** Minimal native confirm so we don't ship a custom modal just for this. */
  private async askCaptureMode(): Promise<CaptureMode | null> {
    if (typeof confirm === "function") {
      return confirm("Record screen + voice? Cancel records voice only.")
        ? "screen+mic"
        : "mic-only";
    }
    return "screen+mic";
  }

  // ---- Internal -------------------------------------------------------------

  private toggleBugMode(): void {
    if (!this.bugMode) return;
    this.bugMode.setOn(!this.bugMode.isOn());
    this.widget?.toast(this.bugMode.isOn() ? "Bug Mode ON — Option+Click to pin" : "Bug Mode OFF");
  }

  private toggleOverlay(): void {
    if (!this.widget) return;
    this.widget.setOverlayOpen(!this.widget.isOverlayOpen());
  }

  private openPinForm(el: Element, x: number, y: number): void {
    if (!this.widget) return;
    this.widget.openPinForm(x, y, selectorFor(el), {
      onSubmit: async (body) => {
        if (!this.api) return;
        const pin = buildPin(el, body);
        await this.api.createPin({
          pin,
          meta: this.snapshotMeta(),
          reporter: this.user,
          reporterAnonKey: this.ensureAnonKey(),
        });
      },
      onCancel: () => {
        /* close handled by Widget */
      },
    });
  }

  private async submitOverlay(body: string, files: File[]): Promise<void> {
    if (!this.api) throw new Error("Quad: not initialized");
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
    const title = body.slice(0, 80) || "(attachment report)";
    await this.api.createSession({
      title,
      body,
      meta: this.snapshotMeta(),
      reporter: this.user,
      reporterAnonKey: this.ensureAnonKey(),
      attachments,
    });
  }

  private snapshotMeta(): ReportMeta {
    return {
      userAgent: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio || 1,
      timezone: timezone(),
      sdkVersion: VERSION,
      commitSha: this.opts.commitSha,
      consoleLogs: this.consoleRing.snapshot(),
      networkErrors: this.networkRing.snapshot(),
      customContext: this.context,
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

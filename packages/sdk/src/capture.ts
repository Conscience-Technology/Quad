/**
 * Capture session. getDisplayMedia + getUserMedia recorded into a single
 * webm. A floating control bar appears (red dot, elapsed time, stop, mute,
 * +pin). Event trail runs in parallel. On stop, the produced blob is
 * uploaded via presigned POST and a kind=capture bug_report is created.
 */
import { EventTrail } from "./event-trail";

export type CaptureMode = "screen+mic" | "mic-only";

export type CaptureCallbacks = {
  onUploadVideo: (blob: Blob) => Promise<{ key: string; mime: string; sizeBytes: number }>;
  onUploadAudio: (blob: Blob) => Promise<{ key: string; mime: string; sizeBytes: number }>;
  onUploadTrail: (json: string) => Promise<{ key: string; mime: string; sizeBytes: number }>;
  onComplete: (input: {
    title: string;
    durationMs: number;
    attachments: Array<{
      key: string;
      mime: string;
      sizeBytes: number;
      kind: "video" | "audio" | "screenshot";
    }>;
    trailKey: string;
  }) => Promise<void>;
  onPin: () => void; // user pressed +Pin in the control bar (handled by widget)
};

export class CaptureSession {
  private screenStream?: MediaStream;
  private micStream?: MediaStream;
  private videoRecorder?: MediaRecorder;
  private audioRecorder?: MediaRecorder;
  private videoChunks: Blob[] = [];
  private audioChunks: Blob[] = [];
  private bar?: HTMLDivElement;
  private elapsedTimer?: number;
  private startedAt = 0;
  private trail: EventTrail;
  private busy = false;

  constructor(
    private shadow: ShadowRoot,
    private hostNode: HTMLElement,
    private cb: CaptureCallbacks,
  ) {
    this.trail = new EventTrail();
  }

  isActive(): boolean {
    return !!this.bar;
  }

  async start(mode: CaptureMode): Promise<void> {
    if (this.busy || this.isActive()) return;
    this.busy = true;
    try {
      if (mode === "screen+mic") {
        if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
          throw new Error("This browser does not support screen recording (mobile is unsupported)");
        }
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 24 },
          audio: true,
        });
      }
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        this.micStream = undefined;
      }

      // Record video (only if we have a screen stream)
      if (this.screenStream) {
        this.videoRecorder = new MediaRecorder(this.screenStream, {
          mimeType: pickMime(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]),
        });
        this.videoRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.videoChunks.push(e.data);
        };
        this.videoRecorder.start(1000);

        // If the user stops sharing via the browser's "Stop sharing" button,
        // treat it like a stop press.
        const track = this.screenStream.getVideoTracks()[0];
        if (track) track.onended = () => this.stop();
      }
      if (this.micStream) {
        this.audioRecorder = new MediaRecorder(this.micStream, {
          mimeType: pickMime(["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]),
        });
        this.audioRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.audioRecorder.start(1000);
      }

      this.startedAt = Date.now();
      this.trail.start_(this.hostNode);
      this.mountBar();
    } catch (err) {
      this.cleanup();
      throw err;
    } finally {
      this.busy = false;
    }
  }

  async stop(title?: string): Promise<void> {
    if (!this.isActive()) return;
    const durationMs = Date.now() - this.startedAt;
    const trailJson = JSON.stringify({ events: this.trail.stop(), durationMs });

    // Stop recorders and wait for the final dataavailable
    const stopRecorder = (r: MediaRecorder | undefined) =>
      new Promise<void>((resolve) => {
        if (!r || r.state === "inactive") return resolve();
        r.onstop = () => resolve();
        r.stop();
      });
    await Promise.all([stopRecorder(this.videoRecorder), stopRecorder(this.audioRecorder)]);

    // Release streams
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.micStream?.getTracks().forEach((t) => t.stop());

    this.removeBar();

    const attachments: Array<{
      key: string;
      mime: string;
      sizeBytes: number;
      kind: "video" | "audio" | "screenshot";
    }> = [];

    if (this.videoChunks.length > 0) {
      const blob = new Blob(this.videoChunks, { type: this.videoRecorder?.mimeType ?? "video/webm" });
      const up = await this.cb.onUploadVideo(blob);
      attachments.push({ ...up, kind: "video" });
    }
    if (this.audioChunks.length > 0) {
      const blob = new Blob(this.audioChunks, { type: this.audioRecorder?.mimeType ?? "audio/webm" });
      const up = await this.cb.onUploadAudio(blob);
      attachments.push({ ...up, kind: "audio" });
    }

    const trailUpload = await this.cb.onUploadTrail(trailJson);

    await this.cb.onComplete({
      title: title?.trim() || `Capture · ${new Date().toLocaleString()}`,
      durationMs,
      attachments,
      trailKey: trailUpload.key,
    });

    this.cleanup();
  }

  /** User pressed +Pin: capture current cursor target via the host's bug_mode
   * picker. The actual element selection happens in the SDK index module. */
  pinFromBar(selector: string): void {
    this.trail.pin(selector);
  }

  // ---- floating control bar -------------------------------------------------

  private mountBar(): void {
    const bar = document.createElement("div");
    bar.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      max-width: calc(100vw - 32px);
      background: var(--elevated);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 8px 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-family: ui-monospace, monospace;
      font-size: 13px;
      color: var(--star-300);
      z-index: 2147483604;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    `;
    bar.innerHTML = `
      <span class="dot" style="width:8px;height:8px;border-radius:50%;background:var(--rose);box-shadow:0 0 8px var(--rose);animation:q-pulse 1.4s ease-in-out infinite"></span>
      <span class="t">00:00</span>
      <button class="stop" title="Stop" style="min-height:28px;background:transparent;border:0;color:var(--star-300);cursor:pointer;font-size:14px">■</button>
      <button class="mute" title="Toggle mic" style="min-height:28px;background:transparent;border:0;color:var(--star-300);cursor:pointer;font-size:14px">🎤</button>
      <button class="pin" title="Pin current element" style="min-height:28px;background:transparent;border:1px solid var(--border);border-radius:999px;color:var(--star-300);cursor:pointer;font-size:13px;padding:3px 8px">Pin</button>
    `;
    // Inject the pulse keyframes if not already present.
    if (!this.shadow.querySelector("style[data-q-pulse]")) {
      const s = document.createElement("style");
      s.setAttribute("data-q-pulse", "1");
      s.textContent = `@keyframes q-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }`;
      this.shadow.appendChild(s);
    }
    this.shadow.appendChild(bar);
    this.bar = bar;

    const tEl = bar.querySelector<HTMLSpanElement>(".t")!;
    this.elapsedTimer = window.setInterval(() => {
      tEl.textContent = formatElapsed(Date.now() - this.startedAt);
    }, 500);

    bar.querySelector<HTMLButtonElement>(".stop")!.addEventListener("click", () => {
      void this.stop();
    });
    bar.querySelector<HTMLButtonElement>(".mute")!.addEventListener("click", (e) => {
      const tracks = this.micStream?.getAudioTracks() ?? [];
      const next = !(tracks[0]?.enabled ?? true);
      tracks.forEach((t) => (t.enabled = next));
      (e.currentTarget as HTMLButtonElement).style.opacity = next ? "1" : "0.4";
    });
    bar.querySelector<HTMLButtonElement>(".pin")!.addEventListener("click", () => this.cb.onPin());
  }

  private removeBar(): void {
    if (this.elapsedTimer) window.clearInterval(this.elapsedTimer);
    this.elapsedTimer = undefined;
    this.bar?.remove();
    this.bar = undefined;
  }

  private cleanup(): void {
    this.removeBar();
    this.videoChunks = [];
    this.audioChunks = [];
    this.videoRecorder = undefined;
    this.audioRecorder = undefined;
    this.screenStream = undefined;
    this.micStream = undefined;
  }
}

function pickMime(candidates: string[]): string {
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return candidates[candidates.length - 1] ?? "video/webm";
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

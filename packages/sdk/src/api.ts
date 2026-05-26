/**
 * Backend client. Talks to the host's Quad endpoint using the SDK key.
 *
 * Two operations are wired here; the full surface lands alongside the ingest
 * API in Phase 1f. For now: `pin` (synchronous JSON) and `session` (free-form
 * report with optional attachments via presigned upload).
 */
import type { PinPayload, ReportMeta } from "./types";

export type ApiConfig = {
  apiKey: string;
  endpoint: string; // e.g. "https://quad.example.com" or "" for same-origin
  version: string;
};

export type IngestPinInput = {
  pin: PinPayload;
  meta: ReportMeta;
  reporter?: { id?: string; email?: string; name?: string };
  reporterAnonKey?: string;
};

export type IngestSessionInput = {
  title: string;
  body: string;
  meta: ReportMeta;
  reporter?: { id?: string; email?: string; name?: string };
  reporterAnonKey?: string;
  attachments?: Array<{ key: string; mime: string; sizeBytes: number; kind: "video" | "audio" | "screenshot" }>;
};

export class Api {
  constructor(private cfg: ApiConfig) {}

  private url(path: string): string {
    const base = this.cfg.endpoint.replace(/\/$/, "");
    return `${base}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-quad-key": this.cfg.apiKey,
      "x-quad-sdk-version": this.cfg.version,
    };
  }

  async createPin(input: IngestPinInput): Promise<{ id: string }> {
    return this.postJson("/api/ingest/pin", input);
  }

  async createSession(input: IngestSessionInput): Promise<{ id: string }> {
    return this.postJson("/api/ingest/session", input);
  }

  async presignUpload(input: {
    filename: string;
    contentType: string;
    sizeBytes: number;
    kind: "video" | "audio" | "screenshot";
  }): Promise<{ url: string; fields: Record<string, string>; key: string }> {
    return this.postJson("/api/ingest/presign", input);
  }

  /** Upload a File or Blob using a previously-acquired presigned POST. */
  async uploadBlob(
    blob: Blob,
    filename: string,
    kind: "video" | "audio" | "screenshot",
  ): Promise<{ key: string; mime: string; sizeBytes: number }> {
    const mime = blob.type || "application/octet-stream";
    const sign = await this.presignUpload({
      filename,
      contentType: mime,
      sizeBytes: blob.size,
      kind,
    });
    const form = new FormData();
    for (const [k, v] of Object.entries(sign.fields)) form.append(k, v);
    form.append("file", blob, filename);
    const res = await fetch(sign.url, { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`upload failed: ${res.status}`);
    }
    return { key: sign.key, mime, sizeBytes: blob.size };
  }

  /** Convenience wrapper for File inputs (drag/drop, file picker). */
  uploadFile(file: File, kind: "video" | "audio" | "screenshot") {
    return this.uploadBlob(file, file.name, kind);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      credentials: "omit",
      mode: "cors",
    });
    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new Error(`Quad ${path} ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    return res.json() as Promise<T>;
  }
}

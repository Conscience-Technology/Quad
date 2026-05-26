/**
 * FFmpeg subprocess wrapper. Used for:
 *   - probing duration of an uploaded webm
 *   - extracting 4-6 keyframes at evenly-spaced timestamps (plus the start)
 *   - extracting the audio track for Whisper
 *
 * Deterministic (no LLM). Spawns the `ffmpeg`/`ffprobe` binaries bundled in
 * the Docker image. On macOS dev, `brew install ffmpeg`.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function probeDurationMs(input: Uint8Array): Promise<number> {
  const dir = await tmpDir();
  try {
    const inputPath = join(dir, "in.webm");
    await writeFile(inputPath, input);
    const out = await runText("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);
    const secs = Number.parseFloat(out.trim());
    return Number.isFinite(secs) ? Math.round(secs * 1000) : 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type Keyframe = { tMs: number; jpeg: Uint8Array };

export async function extractKeyframes(
  input: Uint8Array,
  opts: { count?: number; durationMs?: number; pinTimes?: number[] } = {},
): Promise<Keyframe[]> {
  const count = Math.max(2, Math.min(opts.count ?? 5, 6));
  const dir = await tmpDir();
  try {
    const inputPath = join(dir, "in.webm");
    await writeFile(inputPath, input);

    const durationMs = opts.durationMs ?? (await probeDurationMs(input));
    if (!durationMs || durationMs < 100) return [];

    // Evenly-spaced timestamps + pin markers, dedup, sort.
    const times = new Set<number>();
    for (let i = 0; i < count; i++) {
      times.add(Math.round(((i + 0.5) / count) * durationMs));
    }
    for (const pin of opts.pinTimes ?? []) {
      if (pin >= 0 && pin <= durationMs) times.add(Math.round(pin));
    }
    const sortedTimes = [...times].sort((a, b) => a - b).slice(0, 8);

    const frames: Keyframe[] = [];
    for (const tMs of sortedTimes) {
      const outPath = join(dir, `frame-${tMs}.jpg`);
      const ok = await tryRun("ffmpeg", [
        "-y",
        "-ss",
        (tMs / 1000).toFixed(3),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-q:v",
        "5", // ~jpeg quality 80
        outPath,
      ]);
      if (!ok) continue;
      try {
        const jpeg = await readFile(outPath);
        frames.push({ tMs, jpeg: new Uint8Array(jpeg) });
      } catch { /* missing frame; continue */ }
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Extract the audio track from a webm/mp4 into mp3 (small + Whisper-friendly). */
export async function extractAudio(input: Uint8Array): Promise<Uint8Array | null> {
  const dir = await tmpDir();
  try {
    const inputPath = join(dir, "in.webm");
    const outPath = join(dir, "out.mp3");
    await writeFile(inputPath, input);
    const ok = await tryRun("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      outPath,
    ]);
    if (!ok) return null;
    try {
      return new Uint8Array(await readFile(outPath));
    } catch {
      return null;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---- helpers ---------------------------------------------------------------

async function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "quad-ffmpeg-"));
}

function runText(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    ps.stdout.on("data", (d) => (out += d.toString()));
    ps.stderr.on("data", (d) => (err += d.toString()));
    ps.on("error", reject);
    ps.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${code}: ${err.slice(0, 500)}`))));
  });
}

function tryRun(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const ps = spawn(cmd, args, { stdio: ["ignore", "ignore", "ignore"] });
    ps.on("error", () => resolve(false));
    ps.on("close", (code) => resolve(code === 0));
  });
}

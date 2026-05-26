/**
 * OpenAI Whisper transcription. The ONLY LLM call Quad makes.
 *
 * If OPENAI_API_KEY is unset, this returns null and the rest of the pipeline
 * still runs — videos/audios get stored without transcripts. No vision /
 * chat / embedding endpoints are ever called (enforced by code review).
 */
import { env } from "../env";

export type WhisperSegment = { startMs: number; endMs: number; text: string };
export type WhisperResult = {
  text: string;
  language?: string;
  segments: WhisperSegment[];
};

const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

export async function transcribe(audio: Uint8Array, filename = "audio.mp3"): Promise<WhisperResult | null> {
  const key = env().OPENAI_API_KEY;
  if (!key) return null;

  const form = new FormData();
  form.append(
    "file",
    new Blob([audio as BlobPart], { type: "audio/mpeg" }),
    filename,
  );
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`whisper ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    text?: string;
    language?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  return {
    text: json.text ?? "",
    language: json.language,
    segments: (json.segments ?? []).map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.text.trim(),
    })),
  };
}

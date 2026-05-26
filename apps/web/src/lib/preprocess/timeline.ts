/**
 * Merge event sources into a single ms-aligned timeline.json. Inputs:
 *   - SDK event-trail JSON (click / scroll / input / route_change / pin)
 *   - Whisper segments
 *   - meta.consoleLogs (with raw stack frames; source-map resolution is a
 *     Phase 1j hook — for now we pass the raw frame through)
 *   - meta.networkErrors
 *   - keyframe timestamps
 *
 * Output shape mirrors spec section 6.6.
 */
import type { BugMeta } from "~/db/schema";
import type { WhisperResult } from "./whisper";

export type TimelineEvent =
  | { tMs: number; kind: "click"; selector?: string; componentPath?: string; source?: { file?: string; line?: number } }
  | { tMs: number; kind: "scroll"; scrollY: number }
  | { tMs: number; kind: "input"; selector: string; length: number }
  | { tMs: number; kind: "route_change"; from: string; to: string }
  | { tMs: number; kind: "pin_added"; selector: string; note?: string }
  | { tMs: number; kind: "voice"; text: string }
  | { tMs: number; kind: "frame"; storageKey: string }
  | { tMs: number; kind: "console"; level: string; message: string; source?: { file?: string; line?: number } }
  | { tMs: number; kind: "network"; method: string; url: string; status?: number };

export type TimelineJson = {
  version: 1;
  durationMs: number;
  events: TimelineEvent[];
};

export type TimelineInputs = {
  trail?: { events: Array<Record<string, unknown>>; durationMs?: number } | null;
  whisper?: WhisperResult | null;
  meta: BugMeta;
  frames?: Array<{ tMs: number; storageKey: string }>;
};

export function mergeTimeline(input: TimelineInputs): TimelineJson {
  const events: TimelineEvent[] = [];

  // Trail events
  if (input.trail?.events) {
    for (const ev of input.trail.events) {
      const e = ev as { tMs?: number; kind?: string } & Record<string, unknown>;
      if (typeof e.tMs !== "number" || typeof e.kind !== "string") continue;
      switch (e.kind) {
        case "click":
          events.push({
            tMs: e.tMs,
            kind: "click",
            selector: e.selector as string | undefined,
            componentPath: e.componentPath as string | undefined,
            source: e.sourceLocation as { file?: string; line?: number } | undefined,
          });
          break;
        case "scroll":
          events.push({ tMs: e.tMs, kind: "scroll", scrollY: (e.scrollY as number) ?? 0 });
          break;
        case "input":
          events.push({
            tMs: e.tMs,
            kind: "input",
            selector: (e.selector as string) ?? "",
            length: (e.length as number) ?? 0,
          });
          break;
        case "route_change":
          events.push({
            tMs: e.tMs,
            kind: "route_change",
            from: (e.from as string) ?? "",
            to: (e.to as string) ?? "",
          });
          break;
        case "pin_added":
          events.push({
            tMs: e.tMs,
            kind: "pin_added",
            selector: (e.selector as string) ?? "",
            note: e.note as string | undefined,
          });
          break;
        default:
          // session_start / session_end / voice_marker: skip or carry through
          break;
      }
    }
  }

  // Whisper segments -> voice events
  if (input.whisper) {
    for (const s of input.whisper.segments) {
      events.push({ tMs: s.startMs, kind: "voice", text: s.text });
    }
  }

  // Meta console / network (already in the bug_report at ingest time, but
  // re-projected onto the timeline so the agent sees one view).
  for (const c of input.meta.consoleLogs ?? []) {
    events.push({ tMs: c.tMs, kind: "console", level: c.level, message: c.message });
  }
  for (const n of input.meta.networkErrors ?? []) {
    events.push({
      tMs: n.tMs,
      kind: "network",
      method: n.method,
      url: n.url,
      status: n.status,
    });
  }

  // Frame markers
  for (const f of input.frames ?? []) {
    events.push({ tMs: f.tMs, kind: "frame", storageKey: f.storageKey });
  }

  events.sort((a, b) => a.tMs - b.tMs);

  // Cap to 200 events (spec 6.2). Prefer keeping pin/console/network/voice
  // over scroll if we have to drop.
  const trimmed = events.length <= 200 ? events : trimEvents(events, 200);
  const durationMs = input.trail?.durationMs ?? (events.length > 0 ? events[events.length - 1]!.tMs : 0);

  return { version: 1, durationMs, events: trimmed };
}

function trimEvents(events: TimelineEvent[], cap: number): TimelineEvent[] {
  const rank = (k: TimelineEvent["kind"]): number => {
    switch (k) {
      case "pin_added": return 0;
      case "voice": return 1;
      case "console": return 2;
      case "network": return 3;
      case "route_change": return 4;
      case "frame": return 5;
      case "click": return 6;
      case "input": return 7;
      case "scroll": return 8;
    }
  };
  const sorted = [...events]
    .map((e, i) => ({ e, i, r: rank(e.kind) }))
    .sort((a, b) => a.r - b.r || a.i - b.i);
  return sorted
    .slice(0, cap)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.e);
}

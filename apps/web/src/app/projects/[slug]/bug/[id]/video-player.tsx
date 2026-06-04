"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Surface, Textarea } from "~/components/ui";

type Frame = { id: string; tMs: number; url: string };
type Segment = { startMs: number; endMs: number; text: string };
type VideoComment = { id: string; videoMs: number; authorKind: string; body: string };

export function VideoPlayer({
  videoUrl,
  durationMs,
  frames,
  segments,
  comments,
  onAddPin,
}: {
  videoUrl: string;
  durationMs: number | null;
  frames: Frame[];
  segments: Segment[];
  comments: VideoComment[];
  onAddPin: (ms: number, body: string) => Promise<void>;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [duration, setDuration] = useState(durationMs ?? 0);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [pinDraft, setPinDraft] = useState<{ ms: number; body: string } | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => setCurrentMs(v.currentTime * 1000);
    const onMeta = () => setDuration(v.duration * 1000);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

  // Keyboard: C adds a pin at the current timestamp
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setPinDraft({ ms: Math.round(currentMs), body: "" });
        ref.current?.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentMs]);

  const activeSeg = useMemo(
    () => segments.findIndex((s) => currentMs >= s.startMs && currentMs <= s.endMs),
    [segments, currentMs],
  );

  const seekTo = (ms: number) => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = ms / 1000;
    v.play().catch(() => {});
  };

  const seekFromBar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekTo(Math.max(0, Math.min(duration, pct * duration)));
  };

  const hoverOnBar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    setHoverMs(Math.max(0, Math.min(duration, pct * duration)));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-2 min-w-0">
        <video
          ref={ref}
          src={videoUrl}
          controls={false}
          playsInline
          className="w-full rounded-md bg-black aspect-video"
        />
        {/* Timeline bar with comment pins + frame markers */}
        <div
          className="relative h-8 bg-[var(--color-space-surface)] rounded cursor-pointer"
          onClick={seekFromBar}
          onMouseMove={hoverOnBar}
          onMouseLeave={() => setHoverMs(null)}
        >
          {/* progress */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-[var(--color-nebula-violet)] opacity-30 rounded-l"
            style={{ width: duration ? `${(currentMs / duration) * 100}%` : 0 }}
          />
          {/* frame markers (small cyan ticks) */}
          {duration > 0 &&
            frames.map((f) => (
              <div
                key={f.id}
                title={`frame @ ${formatMs(f.tMs)}`}
                className="absolute top-1 w-0.5 h-2 bg-[var(--color-nebula-cyan)] opacity-60"
                style={{ left: `${(f.tMs / duration) * 100}%` }}
              />
            ))}
          {/* comment pins (stars) */}
          {duration > 0 &&
            comments.map((c) => (
              <div
                key={c.id}
                title={`${c.authorKind} @ ${formatMs(c.videoMs)}: ${c.body}`}
                className="absolute bottom-1 -ml-1.5 text-xs text-[var(--color-nebula-violet)]"
                style={{ left: `${(c.videoMs / duration) * 100}%` }}
              >
                ✦
              </div>
            ))}
          {hoverMs != null && (
            <div
              className="absolute -top-6 -translate-x-1/2 rounded border border-space-border bg-space-void px-1.5 py-0.5 font-mono text-[11px] text-star-300"
              style={{ left: `${(hoverMs / Math.max(1, duration)) * 100}%` }}
            >
              {formatMs(hoverMs)}
            </div>
          )}
        </div>
        {/* Controls */}
        <div className="flex flex-col gap-2 text-xs font-mono text-[var(--color-star-500)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <button onClick={() => ref.current?.play()} className="hover:text-[var(--color-star-100)]">▶</button>
            <button onClick={() => ref.current?.pause()} className="hover:text-[var(--color-star-100)]">‖</button>
            {[0.5, 1, 1.5, 2].map((r) => (
              <button
                key={r}
                onClick={() => { if (ref.current) ref.current.playbackRate = r; }}
                className="hover:text-[var(--color-star-100)]"
              >
                {r}x
              </button>
            ))}
          </div>
          <span className="break-words">{formatMs(currentMs)} / {formatMs(duration)} · <kbd>C</kbd> = pin</span>
        </div>

        {/* Pin draft form */}
        {pinDraft && (
          <Surface className="border border-[var(--color-nebula-violet)]/40">
            <p className="text-xs text-[var(--color-nebula-violet)] uppercase tracking-wide mb-2">
              pin @ {formatMs(pinDraft.ms)}
            </p>
            <Textarea
              autoFocus
              value={pinDraft.body}
              onChange={(e) => setPinDraft({ ...pinDraft, body: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (pinDraft.body.trim()) {
                    onAddPin(pinDraft.ms, pinDraft.body.trim());
                    setPinDraft(null);
                  }
                }
                if (e.key === "Escape") setPinDraft(null);
              }}
              placeholder="Comment at this timestamp (Cmd/Ctrl+Enter to submit)"
              className="min-h-20"
            />
            <div className="flex gap-2 mt-2 text-xs">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (pinDraft.body.trim()) {
                    onAddPin(pinDraft.ms, pinDraft.body.trim());
                    setPinDraft(null);
                  }
                }}
              >
                Submit
              </Button>
              <Button type="button" variant="subtle" onClick={() => setPinDraft(null)}>
                Cancel
              </Button>
            </div>
          </Surface>
        )}
      </div>

      {/* Transcript sidebar — current segment highlighted, click to seek */}
      <aside className="space-y-1 max-h-[480px] min-w-0 overflow-y-auto">
        <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)] sticky top-0 bg-[var(--color-space-bg)] py-1">
          Transcript
        </p>
        {segments.length === 0 && (
          <p className="text-xs text-[var(--color-star-500)]">
            (none — OPENAI_API_KEY missing, or still processing)
          </p>
        )}
        {segments.map((s, i) => (
          <button
            key={`${s.startMs}-${i}`}
            onClick={() => seekTo(s.startMs)}
            className={`block w-full rounded px-2 py-2 text-left text-xs transition-colors ${
              i === activeSeg
                ? "bg-[var(--color-space-elevated)] text-[var(--color-star-100)] border-l-2 border-[var(--color-nebula-violet)]"
                : "text-[var(--color-star-500)] hover:text-[var(--color-star-100)] hover:bg-[var(--color-space-surface)]"
            }`}
          >
            <span className="mr-2 font-mono text-[var(--color-star-700)]">{formatMs(s.startMs)}</span>
            {s.text}
          </button>
        ))}
      </aside>
    </div>
  );
}

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

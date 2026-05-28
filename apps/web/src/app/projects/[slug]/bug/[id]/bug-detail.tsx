"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Code, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";
import { VideoPlayer } from "./video-player";

export function BugDetail({
  projectId,
  projectSlug,
  bugId,
}: {
  projectId: string;
  projectSlug: string;
  bugId: string;
}) {
  const router = useRouter();
  const q = trpc.bugs.byId.useQuery({ projectId, bugId });
  const utils = trpc.useUtils();
  const transition = trpc.bugs.transition.useMutation({
    onSettled: () => utils.bugs.byId.invalidate({ projectId, bugId }),
  });
  const confirm = trpc.bugs.confirm.useMutation({
    onSuccess: (res) => router.push(`/projects/${projectSlug}/task/${res.taskId}`),
  });
  const comment = trpc.bugs.addComment.useMutation({
    onSettled: () => utils.bugs.byId.invalidate({ projectId, bugId }),
  });

  const [instruction, setInstruction] = useState("");
  const [commentBody, setCommentBody] = useState("");

  if (q.isLoading) return <p className="text-sm text-[var(--color-star-500)]">Loading…</p>;
  if (!q.data) return null;
  const { bug, attachments, comments, occurrences, media, transcript } = q.data;
  const requestedAzureWorkItemId = readAzureWorkItemId(bug.meta);
  const azureDevOpsSync = readAzureDevOpsSync(bug.meta);

  const status = bug.status;
  const videoComments = comments
    .filter((c) => c.level === "video" && c.videoMs != null)
    .map((c) => ({ id: c.id, videoMs: c.videoMs ?? 0, authorKind: c.authorKind, body: c.body }));

  return (
    <div className="grid grid-cols-[1fr_320px] gap-8 max-w-6xl">
      <div className="space-y-6 min-w-0">
        <header className="space-y-2">
          <p className="text-xs text-[var(--color-star-500)] uppercase tracking-wide">{bug.kind} · {status}</p>
          <h1 className="text-2xl tracking-tight">{bug.title}</h1>
          <p className="text-xs text-[var(--color-star-500)] font-mono truncate">{bug.targetRoute ?? "/"} · {bug.pageUrl}</p>
        </header>

        {media.videoUrl && (
          <VideoPlayer
            videoUrl={media.videoUrl}
            durationMs={media.videoDurationMs}
            frames={media.frames}
            segments={transcript?.segments ?? []}
            comments={videoComments}
            onAddPin={async (ms, body) => {
              await comment.mutateAsync({
                projectId,
                bugId,
                body,
                level: "video",
                videoMs: ms,
              });
            }}
          />
        )}

        {media.screenshots.length > 0 && (
          <Surface className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
              Screenshots · {media.screenshots.length}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {media.screenshots.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded border border-[var(--color-space-border)] bg-[var(--color-space-surface)]"
                  title={`${s.mime} · ${s.sizeBytes}B`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt="Bug report screenshot"
                    className="block max-h-[420px] w-full object-contain"
                  />
                </a>
              ))}
            </div>
          </Surface>
        )}

        {bug.body && (
          <Surface>
            <p className="text-sm text-[var(--color-star-300)] whitespace-pre-wrap">{bug.body}</p>
          </Surface>
        )}

        {bug.targetSelector && (
          <Surface className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">Target element</p>
            {typeof bug.meta?.customContext?.quadLabel === "string" && (
              <p className="text-sm text-[var(--color-star-100)]">
                <span className="text-[var(--color-nebula-violet)]">●</span>{" "}
                {String(bug.meta.customContext.quadLabel)}
              </p>
            )}
            <Code className="block break-all">{bug.targetSelector}</Code>
            {bug.targetComponentPath && (
              <p className="text-xs text-[var(--color-star-500)] font-mono">{bug.targetComponentPath}</p>
            )}
            {bug.targetSourceLocation?.file && (
              <p className="text-xs text-[var(--color-nebula-cyan)] font-mono">
                {bug.targetSourceLocation.file}
                {bug.targetSourceLocation.line ? `:${bug.targetSourceLocation.line}` : ""}
              </p>
            )}
          </Surface>
        )}

        {attachments.length > 0 && (
          <Surface className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
              Attachments · {attachments.length}
            </p>
            {attachments.map((a) => (
              <p key={a.id} className="text-xs text-[var(--color-star-500)] font-mono truncate">
                {a.kind} · {a.mime} · {a.sizeBytes}B
                {a.tMs != null ? ` · ${a.tMs}ms` : ""}
              </p>
            ))}
          </Surface>
        )}

        {occurrences.length > 0 && (
          <p className="text-xs text-[var(--color-nebula-amber)]">
            ×{occurrences.length + 1} (1 primary + {occurrences.length} more occurrences)
          </p>
        )}

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
            Thread · {comments.length}
          </h2>
          {comments.map((c) => (
            <Surface key={c.id} className="!p-3">
              <p className="text-xs text-[var(--color-star-500)] uppercase tracking-wide">
                {c.authorKind}
                {c.level === "video" && c.videoMs != null && ` @${(c.videoMs / 1000).toFixed(1)}s`}
              </p>
              <p className="text-sm text-[var(--color-star-100)] mt-1 whitespace-pre-wrap">{c.body}</p>
            </Surface>
          ))}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!commentBody.trim()) return;
              comment.mutate({ projectId, bugId, body: commentBody });
              setCommentBody("");
            }}
          >
            <Input
              type="text"
              value={commentBody}
              onChange={(e) => setCommentBody(e.currentTarget.value)}
              placeholder="Comment (Enter to send)"
            />
          </form>
        </section>
      </div>

      <aside className="space-y-4">
        {requestedAzureWorkItemId && (
          <Surface className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">Azure DevOps</p>
            <p className="text-sm text-[var(--color-star-300)]">Requested Work Item #{requestedAzureWorkItemId}</p>
            {azureDevOpsSync && (
              <p className={`text-xs ${azureDevOpsSync.synced ? "text-[var(--color-nebula-cyan)]" : "text-[var(--color-nebula-rose)]"}`}>
                {azureDevOpsSync.synced
                  ? `Synced${azureDevOpsSync.state ? ` → ${azureDevOpsSync.state}` : ""}`
                  : azureDevOpsSync.error ?? "Azure DevOps sync skipped"}
              </p>
            )}
          </Surface>
        )}

        {status === "confirmed" ? (
          <Surface>
            <p className="text-sm text-[var(--color-star-300)]">
              Confirmed. <a className="text-[var(--color-nebula-cyan)]" href={`/projects/${projectSlug}`}>board</a> to see the Task.
            </p>
          </Surface>
        ) : (
          <Surface className="space-y-3">
            <Field label="Maintainer intent (optional)" hint="If empty, the reporter body becomes the instruction">
              <Input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.currentTarget.value)}
                placeholder="What you want fixed…"
              />
            </Field>
            <Button
              variant="primary"
              onClick={() =>
                confirm.mutate({
                  projectId,
                  bugId,
                  maintainerInstruction: instruction || undefined,
                })
              }
              disabled={confirm.isPending}
              className="w-full"
            >
              {confirm.isPending ? "…" : "Confirm → Task"}
            </Button>
            {confirm.error && (
              <p className="text-xs text-[var(--color-nebula-rose)]">{confirm.error.message}</p>
            )}
          </Surface>
        )}

        <Surface className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">Transition</p>
          {(["triaging", "wont_do", "resolved"] as const).map((s) => (
            <Button
              key={s}
              variant={s === "wont_do" ? "danger" : "ghost"}
              className="w-full"
              disabled={transition.isPending || status === s}
              onClick={() => transition.mutate({ projectId, bugId, status: s })}
            >
              → {s}
            </Button>
          ))}
        </Surface>
      </aside>
    </div>
  );
}

function readAzureWorkItemId(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const customContext = (meta as { customContext?: unknown }).customContext;
  if (!customContext || typeof customContext !== "object") return null;
  const value = (customContext as { azureWorkItemId?: unknown }).azureWorkItemId;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function readAzureDevOpsSync(meta: unknown): { synced?: boolean; state?: string; error?: string } | null {
  if (!meta || typeof meta !== "object") return null;
  const customContext = (meta as { customContext?: unknown }).customContext;
  if (!customContext || typeof customContext !== "object") return null;
  const sync = (customContext as { azureDevOps?: unknown }).azureDevOps;
  if (!sync || typeof sync !== "object") return null;
  return {
    synced: typeof (sync as { synced?: unknown }).synced === "boolean" ? (sync as { synced: boolean }).synced : undefined,
    state: typeof (sync as { state?: unknown }).state === "string" ? (sync as { state: string }).state : undefined,
    error: typeof (sync as { error?: unknown }).error === "string" ? (sync as { error: string }).error : undefined,
  };
}

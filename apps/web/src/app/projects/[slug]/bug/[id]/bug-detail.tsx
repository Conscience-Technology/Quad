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

        {bug.body && (
          <Surface>
            <p className="text-sm text-[var(--color-star-300)] whitespace-pre-wrap">{bug.body}</p>
          </Surface>
        )}

        {bug.targetSelector && (
          <Surface className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">Target element</p>
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

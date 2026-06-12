"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Code, Field, Input, Surface } from "~/components/ui";
import type { BugReport } from "~/db/schema";
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

        <FeedbackFields
          key={`${bug.id}:${bug.updatedAt}`}
          projectId={projectId}
          bug={bug}
          fallbackLocation={formatLocationFallback(bug)}
        />

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

function FeedbackFields({
  projectId,
  bug,
  fallbackLocation,
}: {
  projectId: string;
  bug: BugReport;
  fallbackLocation: string;
}) {
  const utils = trpc.useUtils();
  const update = trpc.bugs.updateFeedback.useMutation({
    onSettled: () => utils.bugs.byId.invalidate({ projectId, bugId: bug.id }),
  });
  const [type, setType] = useState(bug.feedbackType ?? "");
  const [feature, setFeature] = useState(bug.feedbackFeature ?? "");
  const [userStory, setUserStory] = useState(bug.feedbackUserStory ?? "");
  const [location, setLocation] = useState(bug.feedbackLocation ?? fallbackLocation);
  const [currentSpec, setCurrentSpec] = useState(
    bug.feedbackCurrentSpec ?? [bug.title, bug.body].filter(Boolean).join("\n\n"),
  );
  const [intendedSpec, setIntendedSpec] = useState(bug.feedbackIntendedSpec ?? "");
  const [reporter, setReporter] = useState(
    bug.feedbackReporter ??
      bug.reporterIdentify?.name ??
      bug.reporterIdentify?.email ??
      bug.reporterIdentify?.id ??
      bug.reporterAnonKey ??
      "",
  );
  const [comment, setComment] = useState(bug.feedbackComment ?? "");

  return (
    <Surface className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
            Excel feedback row
          </p>
          <p className="mt-1 text-xs text-[var(--color-star-500)]">
            These fields are stored with the report and used directly by Excel export.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              projectId,
              bugId: bug.id,
              feedback: {
                type,
                feature,
                userStory,
                location,
                currentSpec,
                intendedSpec,
                reporter,
                comment,
              },
            })
          }
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Type">
          <Input value={type} onChange={(e) => setType(e.currentTarget.value)} placeholder="요구사항 변경" />
        </Field>
        <Field label="Reporter">
          <Input value={reporter} onChange={(e) => setReporter(e.currentTarget.value)} placeholder="보고자" />
        </Field>
        <Field label="Feature">
          <Input value={feature} onChange={(e) => setFeature(e.currentTarget.value)} placeholder="Feature 번호" />
        </Field>
        <Field label="User Story">
          <Input value={userStory} onChange={(e) => setUserStory(e.currentTarget.value)} placeholder="User Story 번호" />
        </Field>
      </div>
      <Field label="Location">
        <textarea
          className="min-h-20 w-full resize-y rounded-md border border-space-border bg-space-void p-3 text-sm text-star-100 outline-none transition focus:border-nebula-violet"
          value={location}
          onChange={(e) => setLocation(e.currentTarget.value)}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="현재 사양">
          <textarea
            className="min-h-36 w-full resize-y rounded-md border border-space-border bg-space-void p-3 text-sm text-star-100 outline-none transition focus:border-nebula-violet"
            value={currentSpec}
            onChange={(e) => setCurrentSpec(e.currentTarget.value)}
          />
        </Field>
        <Field label="의도 사양">
          <textarea
            className="min-h-36 w-full resize-y rounded-md border border-space-border bg-space-void p-3 text-sm text-star-100 outline-none transition focus:border-nebula-violet"
            value={intendedSpec}
            onChange={(e) => setIntendedSpec(e.currentTarget.value)}
            placeholder="QA/기획팀이 정리한 기대 동작"
          />
        </Field>
      </div>
      <Field label="코멘트">
        <textarea
          className="min-h-28 w-full resize-y rounded-md border border-space-border bg-space-void p-3 text-sm text-star-100 outline-none transition focus:border-nebula-violet"
          value={comment}
          onChange={(e) => setComment(e.currentTarget.value)}
        />
      </Field>
      {update.error && (
        <p className="text-xs text-[var(--color-nebula-rose)]">{update.error.message}</p>
      )}
    </Surface>
  );
}

function formatLocationFallback(bug: BugReport): string {
  return [
    bug.targetRoute ? `Route: ${bug.targetRoute}` : null,
    bug.targetSelector ? `Selector: ${bug.targetSelector}` : null,
    bug.targetComponentPath ? `Component: ${bug.targetComponentPath}` : null,
    bug.pageUrl ? `URL: ${bug.pageUrl}` : null,
  ].filter(Boolean).join("\n");
}

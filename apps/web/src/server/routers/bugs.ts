/**
 * Bugs router — Inbox / Triage / Confirmed / Resolved board feeds, detail,
 * status transitions, comments. Confirm hands off to the brief generator.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { buildTaskBrief } from "~/lib/brief";
import { presignDownload } from "~/lib/storage";
import { projectMemberProcedure } from "../auth-procedures";
import { router } from "../trpc";

const StatusFilter = z.enum(["new", "triaging", "confirmed", "resolved", "wont_do", "all"]).default("new");
const NextStatus = z.enum(["new", "triaging", "confirmed", "resolved", "wont_do"]);
const FeedbackInput = z.object({
  type: z.string().max(200).optional(),
  feature: z.string().max(200).optional(),
  userStory: z.string().max(200).optional(),
  location: z.string().max(4000).optional(),
  currentSpec: z.string().max(8000).optional(),
  intendedSpec: z.string().max(8000).optional(),
  reporter: z.string().max(200).optional(),
  comment: z.string().max(8000).optional(),
});

export const bugsRouter = router({
  list: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        status: StatusFilter,
        limit: z.number().int().min(1).max(200).default(60),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where =
        input.status === "all"
          ? eq(schema.bugReports.projectId, input.projectId)
          : and(
              eq(schema.bugReports.projectId, input.projectId),
              eq(schema.bugReports.status, input.status),
            );
      return ctx.db
        .select({
          id: schema.bugReports.id,
          fingerprint: schema.bugReports.fingerprint,
          kind: schema.bugReports.kind,
          status: schema.bugReports.status,
          title: schema.bugReports.title,
          targetRoute: schema.bugReports.targetRoute,
          createdAt: schema.bugReports.createdAt,
          updatedAt: schema.bugReports.updatedAt,
        })
        .from(schema.bugReports)
        .where(where)
        .orderBy(desc(schema.bugReports.updatedAt))
        .limit(input.limit);
    }),

  byId: projectMemberProcedure
    .input(z.object({ projectId: z.string().uuid(), bugId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [bug] = await ctx.db
        .select()
        .from(schema.bugReports)
        .where(
          and(
            eq(schema.bugReports.id, input.bugId),
            eq(schema.bugReports.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!bug) throw new TRPCError({ code: "NOT_FOUND" });
      const [attachments, comments, occurrences] = await Promise.all([
        ctx.db
          .select()
          .from(schema.attachments)
          .where(eq(schema.attachments.bugReportId, bug.id))
          .orderBy(asc(schema.attachments.tMs)),
        ctx.db
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.bugReportId, bug.id))
          .orderBy(asc(schema.comments.createdAt)),
        ctx.db
          .select()
          .from(schema.bugOccurrences)
          .where(eq(schema.bugOccurrences.bugReportId, bug.id)),
      ]);

      // Signed URLs for video / audio / frames (10 min); transcript inlined.
      const video = attachments.find((a) => a.kind === "video");
      const audio = attachments.find((a) => a.kind === "audio");
      const frames = attachments.filter((a) => a.kind === "frame");

      const [videoUrl, audioUrl, frameUrls] = await Promise.all([
        video ? presignDownload(video.storageKey, 600) : Promise.resolve(undefined),
        audio ? presignDownload(audio.storageKey, 600) : Promise.resolve(undefined),
        Promise.all(
          frames.map(async (f) => ({
            id: f.id,
            tMs: f.tMs ?? 0,
            url: await presignDownload(f.storageKey, 600),
          })),
        ),
      ]);

      // Transcript for the recording (parent attachment id matches video/audio).
      let transcript: typeof schema.transcripts.$inferSelect | null = null;
      const parentIds = [video?.id, audio?.id].filter((x): x is string => !!x);
      if (parentIds.length > 0) {
        const trows = await ctx.db
          .select()
          .from(schema.transcripts)
          .where(inArray(schema.transcripts.attachmentId, parentIds))
          .limit(1);
        transcript = trows[0] ?? null;
      }

      return {
        bug,
        attachments,
        comments,
        occurrences,
        media: { videoUrl, audioUrl, frames: frameUrls, videoDurationMs: video?.durationMs ?? null },
        transcript,
      };
    }),

  transition: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        bugId: z.string().uuid(),
        status: NextStatus,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(schema.bugReports)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(schema.bugReports.id, input.bugId),
            eq(schema.bugReports.projectId, input.projectId),
          ),
        )
        .returning();
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "bug.transition",
        target: input.bugId,
        meta: { status: input.status },
      });
      return updated;
    }),

  confirm: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        bugId: z.string().uuid(),
        maintainerInstruction: z.string().max(2_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [bug] = await ctx.db
        .select()
        .from(schema.bugReports)
        .where(
          and(
            eq(schema.bugReports.id, input.bugId),
            eq(schema.bugReports.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!bug) throw new TRPCError({ code: "NOT_FOUND" });
      if (bug.status === "confirmed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already confirmed" });
      }
      const result = await buildTaskBrief({
        bugReportId: bug.id,
        maintainerInstruction: input.maintainerInstruction,
        confirmedByUserId: ctx.user.id,
      });
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "bug.confirm",
        target: bug.id,
        meta: { taskId: result.taskId },
      });
      return result;
    }),

  addComment: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        bugId: z.string().uuid(),
        body: z.string().min(1).max(4_000),
        level: z.enum(["bug", "pin", "video"]).default("bug"),
        videoAttachmentId: z.string().uuid().optional(),
        videoMs: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [comment] = await ctx.db
        .insert(schema.comments)
        .values({
          bugReportId: input.bugId,
          level: input.level,
          videoAttachmentId: input.videoAttachmentId ?? null,
          videoMs: input.videoMs ?? null,
          authorKind: "member",
          authorUserId: ctx.user.id,
          body: input.body,
        })
        .returning();
      await ctx.db
        .update(schema.bugReports)
        .set({
          feedbackComment: sqlAppendLine(schema.bugReports.feedbackComment, input.body),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.bugReports.id, input.bugId),
            eq(schema.bugReports.projectId, input.projectId),
          ),
        );
      return comment;
    }),

  updateFeedback: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        bugId: z.string().uuid(),
        feedback: FeedbackInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clean = (value: string | undefined) => {
        const trimmed = value?.trim();
        return trimmed ? trimmed : null;
      };
      const [updated] = await ctx.db
        .update(schema.bugReports)
        .set({
          feedbackType: clean(input.feedback.type),
          feedbackFeature: clean(input.feedback.feature),
          feedbackUserStory: clean(input.feedback.userStory),
          feedbackLocation: clean(input.feedback.location),
          feedbackCurrentSpec: clean(input.feedback.currentSpec),
          feedbackIntendedSpec: clean(input.feedback.intendedSpec),
          feedbackReporter: clean(input.feedback.reporter),
          feedbackComment: clean(input.feedback.comment),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.bugReports.id, input.bugId),
            eq(schema.bugReports.projectId, input.projectId),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "bug.feedback.update",
        target: input.bugId,
        meta: {},
      });
      return updated;
    }),
});

function sqlAppendLine(column: typeof schema.bugReports.feedbackComment, next: string) {
  return sql<string | null>`case
    when ${column} is null or ${column} = '' then ${next}
    else ${column} || ${"\n"} || ${next}
  end`;
}

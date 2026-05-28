/**
 * `quad-mcp` — MCP stdio server. Talks to a Quad instance using QUAD_API_KEY
 * and QUAD_ENDPOINT. Exposes 6 tools today; more lazy-pull helpers follow.
 *
 * Configure in Claude Code (~/.config/claude-code/mcp.json):
 *   {
 *     "mcpServers": {
 *       "quad": {
 *         "command": "npx",
 *         "args": ["-y", "@quad/mcp"],
 *         "env": {
 *           "QUAD_API_KEY": "qd_mcp_...",
 *           "QUAD_ENDPOINT": "https://quad.example.com"
 *         }
 *       }
 *     }
 *   }
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "./index.js";

const ENDPOINT = (process.env.QUAD_ENDPOINT ?? "").replace(/\/$/, "");
const KEY = process.env.QUAD_API_KEY ?? "";
const TASK_STATUSES = ["queued", "picked", "in_progress", "pr_open", "done", "wont_do"] as const;

if (!ENDPOINT || !KEY) {
  console.error("QUAD_ENDPOINT and QUAD_API_KEY are required");
  process.exit(1);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENDPOINT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

const TOOLS = [
  {
    name: "quad_doctor",
    description:
      "Diagnose Quad MCP connectivity, API key scope, available projects, queued tasks, and configured issue integrations. Run this first when Quad tools behave unexpectedly.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "quad_list_tasks",
    description: "List tasks for one or all accessible projects. Filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        status: {
          type: "string",
          enum: TASK_STATUSES,
        },
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "quad_pick_task",
    description:
      "Claim the next queued task (or the specified one). Transitions queued -> picked and starts a lease.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        task_id: { type: "string" },
        lease_ms: { type: "number" },
      },
    },
  },
  {
    name: "quad_renew_task",
    description: "Renew the lease for a picked task so it is not reclaimed as stale.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string" },
        lease_ms: { type: "number" },
      },
    },
  },
  {
    name: "quad_get_task",
    description:
      "Fetch the full Task Brief: markdown body + inline frame images (base64) + timeline.json + signed URLs for video/audio.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
    },
  },
  {
    name: "quad_update_task",
    description:
      "Update task status, optionally attaching a PR URL. If an external issue is linked and credentials are available, Quad syncs the mapped external state and records sync metadata.",
    inputSchema: {
      type: "object",
      required: ["task_id", "status"],
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: TASK_STATUSES },
        pr_url: { type: "string" },
        note: { type: "string" },
      },
    },
  },
  {
    name: "quad_list_integrations",
    description:
      "List configured issue integrations for accessible projects, including credential source and whether each integration is usable.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
      },
    },
  },
  {
    name: "quad_test_integration",
    description:
      "Test an issue integration for a project. Optionally checks a specific issue/work item id.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        provider: { type: "string", enum: ["azure-devops", "github-issues", "mock"] },
        issue_id: { type: ["string", "number"] },
      },
    },
  },
  {
    name: "quad_link_issue",
    description:
      "Link a Quad task to an external issue. Azure DevOps is the current provider; this also moves the external issue to the configured report-submitted state.",
    inputSchema: {
      type: "object",
      required: ["task_id", "issue_id"],
      properties: {
        task_id: { type: "string" },
        provider: { type: "string", enum: ["azure-devops", "github-issues", "mock"] },
        issue_id: { type: ["string", "number"] },
      },
    },
  },
  {
    name: "quad_post_comment",
    description: "Post a comment on the bug thread of the given task (visible to the Reporter).",
    inputSchema: {
      type: "object",
      required: ["task_id", "body"],
      properties: {
        task_id: { type: "string" },
        body: { type: "string" },
        level: { type: "string", enum: ["bug", "pin", "video"] },
        video_ms: { type: "number" },
      },
    },
  },
  {
    name: "quad_search_tasks",
    description: "Search tasks by title substring within accessible projects.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        project_id: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "quad_get_frames",
    description:
      "Fetch additional key frames (base64 images) for the given task, optionally filtered to a time window.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string" },
        from_ms: { type: "number" },
        to_ms: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "quad_get_transcript",
    description: "Fetch the Whisper transcript (text + segment timestamps) for the task's recording.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
    },
  },
  {
    name: "quad_get_timeline",
    description:
      "Fetch the merged ms-aligned event timeline (click/console/network/voice/pin). Optional `kinds` filter.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string" },
        kinds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "quad_get_source",
    description:
      "Fetch the source pointer (selector, component path, source-mapped file:line, repo info) for the task.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
    },
  },
] as const;

type ListTasksArgs = { project_id?: string; status?: string; query?: string; limit?: number };
type PickArgs = { project_id?: string; task_id?: string; lease_ms?: number };
type GetArgs = { task_id: string };
type RenewArgs = { task_id: string; lease_ms?: number };
type UpdateArgs = { task_id: string; status: string; pr_url?: string; note?: string };
type CommentArgs = { task_id: string; body: string; level?: string; video_ms?: number };
type IntegrationArgs = { project_id?: string; provider?: string; issue_id?: string | number };
type LinkIssueArgs = { task_id: string; provider?: string; issue_id: string | number };

const server = new Server(
  { name: "quad-mcp", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case "quad_doctor": {
        const r = await api<Record<string, unknown>>("/api/mcp/doctor");
        return text("```json\n" + JSON.stringify(r, null, 2) + "\n```");
      }
      case "quad_list_tasks": {
        const a = args as ListTasksArgs;
        const qs = new URLSearchParams();
        if (a.project_id) qs.set("project_id", a.project_id);
        if (a.status) qs.set("status", a.status);
        if (a.query) qs.set("query", a.query);
        if (a.limit) qs.set("limit", String(a.limit));
        const r = await api<{ tasks: Array<Record<string, unknown>> }>(`/api/mcp/tasks?${qs.toString()}`);
        return text(JSON.stringify(r.tasks, null, 2));
      }
      case "quad_pick_task": {
        const r = await api<{ task: Record<string, unknown> | null; error?: string }>(
          "/api/mcp/tasks/pick",
          {
            method: "POST",
            body: JSON.stringify({
              projectId: (args as PickArgs).project_id,
              taskId: (args as PickArgs).task_id,
              leaseMs: (args as PickArgs).lease_ms,
            }),
          },
        );
        if (!r.task) return text(`No queued task available${r.error ? ` (${r.error})` : ""}.`);
        // Immediately fetch the full brief so the agent can act in one round.
        const full = await fetchTask(((r.task as { id: string }).id));
        return briefContent(full);
      }
      case "quad_renew_task": {
        const a = args as RenewArgs;
        const r = await api<Record<string, unknown>>(`/api/mcp/tasks/${a.task_id}/lease`, {
          method: "POST",
          body: JSON.stringify({ leaseMs: a.lease_ms }),
        });
        return text("```json\n" + JSON.stringify(r, null, 2) + "\n```");
      }
      case "quad_get_task": {
        const a = args as GetArgs;
        const full = await fetchTask(a.task_id);
        return briefContent(full);
      }
      case "quad_update_task": {
        const a = args as UpdateArgs;
        const r = await api<Record<string, unknown>>(`/api/mcp/tasks/${a.task_id}/status`, {
          method: "POST",
          body: JSON.stringify({ status: a.status, prUrl: a.pr_url, note: a.note }),
        });
        return text(
          `task ${a.task_id} → ${a.status}${a.pr_url ? ` (${a.pr_url})` : ""}\n` +
            "```json\n" + JSON.stringify(r, null, 2) + "\n```",
        );
      }
      case "quad_post_comment": {
        const a = args as CommentArgs;
        const r = await api<{ id: string }>(`/api/mcp/tasks/${a.task_id}/comment`, {
          method: "POST",
          body: JSON.stringify({
            body: a.body,
            level: a.level ?? "bug",
            videoMs: a.video_ms,
          }),
        });
        return text(`comment posted (id: ${r.id})`);
      }
      case "quad_list_integrations": {
        const a = args as IntegrationArgs;
        const qs = new URLSearchParams();
        if (a.project_id) qs.set("project_id", a.project_id);
        const r = await api<Record<string, unknown>>(`/api/mcp/integrations?${qs.toString()}`);
        return text("```json\n" + JSON.stringify(r, null, 2) + "\n```");
      }
      case "quad_test_integration": {
        const a = args as IntegrationArgs;
        const r = await api<Record<string, unknown>>("/api/mcp/integrations", {
          method: "POST",
          body: JSON.stringify({
            projectId: a.project_id,
            provider: a.provider ?? "azure-devops",
            issueId: a.issue_id,
          }),
        });
        return text("```json\n" + JSON.stringify(r, null, 2) + "\n```");
      }
      case "quad_link_issue": {
        const a = args as LinkIssueArgs;
        const r = await api<Record<string, unknown>>(`/api/mcp/tasks/${a.task_id}/issue`, {
          method: "POST",
          body: JSON.stringify({
            provider: a.provider ?? "azure-devops",
            issueId: a.issue_id,
          }),
        });
        return text("```json\n" + JSON.stringify(r, null, 2) + "\n```");
      }
      case "quad_search_tasks": {
        const a = args as { query: string; project_id?: string; limit?: number };
        const qs = new URLSearchParams();
        qs.set("query", a.query);
        if (a.project_id) qs.set("project_id", a.project_id);
        if (a.limit) qs.set("limit", String(a.limit));
        const r = await api<{ tasks: Array<Record<string, unknown>> }>(`/api/mcp/tasks?${qs.toString()}`);
        return text(JSON.stringify(r.tasks, null, 2));
      }
      case "quad_get_frames": {
        const a = args as { task_id: string; from_ms?: number; to_ms?: number; limit?: number };
        const qs = new URLSearchParams();
        if (a.from_ms != null) qs.set("from_ms", String(a.from_ms));
        if (a.to_ms != null) qs.set("to_ms", String(a.to_ms));
        if (a.limit != null) qs.set("limit", String(a.limit));
        const r = await api<{ frames: Array<{ tMs: number; mime: string; data: string }> }>(
          `/api/mcp/tasks/${a.task_id}/frames?${qs.toString()}`,
        );
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [{ type: "text", text: `${r.frames.length} frame(s)` }];
        for (const f of r.frames) {
          content.push({ type: "image", data: f.data, mimeType: f.mime });
        }
        return { content };
      }
      case "quad_get_transcript": {
        const a = args as GetArgs;
        const r = await api<{
          transcript: null | {
            text: string;
            language?: string;
            segments: Array<{ startMs: number; endMs: number; text: string }>;
          };
        }>(`/api/mcp/tasks/${a.task_id}/transcript`);
        if (!r.transcript) return text("No transcript (no audio/video, or STT disabled).");
        const lines = r.transcript.segments
          .map((s) => `[${(s.startMs / 1000).toFixed(2)}s] ${s.text}`)
          .join("\n");
        return text(
          `### transcript (${r.transcript.language ?? "auto"})\n${lines}`,
        );
      }
      case "quad_get_timeline": {
        const a = args as { task_id: string; kinds?: string[] };
        const qs = new URLSearchParams();
        if (a.kinds?.length) qs.set("kinds", a.kinds.join(","));
        const r = await api<{ timeline: unknown }>(`/api/mcp/tasks/${a.task_id}/timeline?${qs.toString()}`);
        if (!r.timeline) return text("No timeline (preprocessing not yet completed).");
        return text("```json\n" + JSON.stringify(r.timeline, null, 2) + "\n```");
      }
      case "quad_get_source": {
        const a = args as GetArgs;
        const r = await api<Record<string, unknown>>(`/api/mcp/tasks/${a.task_id}/source`);
        return text(JSON.stringify(r, null, 2));
      }
      default:
        return text(`unknown tool: ${name}`, true);
    }
  } catch (err) {
    return text(`error: ${err instanceof Error ? err.message : String(err)}`, true);
  }
});

type FullTask = {
  task: Record<string, unknown>;
  markdown: string;
  frames: Array<{ tMs: number; mime: string; data: string }>;
  timelineJson?: string;
  videoUrl?: string;
  audioUrl?: string;
};

async function fetchTask(id: string): Promise<FullTask> {
  return api<FullTask>(`/api/mcp/tasks/${id}`);
}

function briefContent(full: FullTask) {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  > = [];
  content.push({ type: "text", text: full.markdown });
  for (const f of full.frames) {
    content.push({ type: "image", data: f.data, mimeType: f.mime });
  }
  if (full.timelineJson) {
    content.push({ type: "text", text: "### timeline.json\n```json\n" + full.timelineJson + "\n```" });
  }
  if (full.videoUrl) content.push({ type: "text", text: `video (signed, 10min): ${full.videoUrl}` });
  if (full.audioUrl) content.push({ type: "text", text: `audio (signed, 10min): ${full.audioUrl}` });
  return { content };
}

function text(s: string, isError = false) {
  return { content: [{ type: "text" as const, text: s }], isError };
}

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * `quad` CLI. Talks to a self-hosted Quad instance via an MCP-scoped API key.
 * Config lives in ~/.quad/config.json. No native keychain (Phase 2).
 */
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative, sep as pathSep } from "node:path";
import { Command } from "commander";

type Config = { endpoint: string; apiKey: string };

const program = new Command()
  .name("quad")
  .description("Quad CLI — talk to your self-hosted Quad instance")
  .version("0.0.0");

program
  .command("login")
  .description("Save your MCP key + endpoint")
  .requiredOption("-e, --endpoint <url>", "Quad endpoint URL")
  .requiredOption("-k, --key <key>", "MCP key (qd_mcp_...)")
  .action(async (opts: { endpoint: string; key: string }) => {
    await writeConfig({ endpoint: opts.endpoint.replace(/\/$/, ""), apiKey: opts.key });
    console.log(`saved ${configPath()}`);
  });

program
  .command("list")
  .description("List tasks")
  .option("-p, --project <id>", "project id")
  .option("-s, --status <status>", "queued|picked|in_progress|pr_open|done|wont_do", "queued")
  .option("-q, --query <q>", "title substring")
  .action(async (o: { project?: string; status: string; query?: string }) => {
    const cfg = await loadConfig();
    const qs = new URLSearchParams({ status: o.status });
    if (o.project) qs.set("project_id", o.project);
    if (o.query) qs.set("query", o.query);
    const { tasks } = await api<{ tasks: Array<{ id: string; title: string; status: string }> }>(cfg, `/api/mcp/tasks?${qs}`);
    if (tasks.length === 0) {
      console.log("(none)");
      return;
    }
    for (const t of tasks) console.log(`${t.status.padEnd(12)} ${t.id}  ${t.title}`);
  });

program
  .command("pull")
  .description("Pull a task into ./.quad/tasks/<id>/")
  .argument("[task-id]")
  .option("--next", "pick the next queued task")
  .option("-p, --project <id>", "project id when using --next")
  .action(async (taskId: string | undefined, o: { next?: boolean; project?: string }) => {
    const cfg = await loadConfig();
    let id = taskId;
    if (!id && o.next) {
      const r = await api<{ task: { id: string } | null }>(cfg, "/api/mcp/tasks/pick", {
        method: "POST",
        body: JSON.stringify({ projectId: o.project }),
      });
      if (!r.task) { console.error("no queued task"); process.exit(1); }
      id = r.task.id;
      console.log(`picked ${id}`);
    }
    if (!id) { console.error("task-id or --next required"); process.exit(2); }

    const full = await api<{
      task: { id: string; title: string; status: string };
      markdown: string;
      frames: Array<{ tMs: number; mime: string; data: string }>;
      timelineJson?: string;
      videoUrl?: string;
      audioUrl?: string;
    }>(cfg, `/api/mcp/tasks/${id}`);

    const outDir = join(process.cwd(), ".quad", "tasks", id);
    const framesDir = join(outDir, "frames");
    await mkdir(framesDir, { recursive: true });
    await writeFile(join(outDir, "TASK_BRIEF.md"), full.markdown, "utf8");
    if (full.timelineJson) await writeFile(join(outDir, "timeline.json"), full.timelineJson, "utf8");
    for (const f of full.frames) {
      const ext = (f.mime.split("/")[1] ?? "jpg").split(";")[0];
      const buf = Buffer.from(f.data, "base64");
      await writeFile(join(framesDir, `frame-${f.tMs}.${ext}`), buf);
    }
    await writeFile(
      join(outDir, "manifest.json"),
      JSON.stringify(
        {
          taskId: id,
          title: full.task.title,
          status: full.task.status,
          videoUrl: full.videoUrl,
          audioUrl: full.audioUrl,
          frames: full.frames.map((f) => ({ tMs: f.tMs, mime: f.mime })),
        },
        null,
        2,
      ),
    );
    console.log(`→ ${relative(process.cwd(), outDir)}/TASK_BRIEF.md`);
  });

program
  .command("status <task-id>")
  .description("Update task status")
  .requiredOption("--set <status>", "queued|picked|in_progress|pr_open|done|wont_do")
  .option("--pr <url>", "PR URL (with --set pr_open)")
  .option("--note <text>", "free-form note attached to the audit event")
  .action(async (taskId: string, o: { set: string; pr?: string; note?: string }) => {
    const cfg = await loadConfig();
    await api(cfg, `/api/mcp/tasks/${taskId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: o.set, prUrl: o.pr, note: o.note }),
    });
    console.log(`${taskId} → ${o.set}`);
  });

program
  .command("comment <task-id> <body>")
  .description("Post a comment on the bug thread")
  .option("--level <level>", "bug|pin|video", "bug")
  .option("--video-ms <ms>", "video timestamp (with --level video)")
  .action(async (taskId: string, body: string, o: { level: string; videoMs?: string }) => {
    const cfg = await loadConfig();
    await api(cfg, `/api/mcp/tasks/${taskId}/comment`, {
      method: "POST",
      body: JSON.stringify({
        body,
        level: o.level,
        videoMs: o.videoMs ? Number.parseInt(o.videoMs, 10) : undefined,
      }),
    });
    console.log("comment posted");
  });

program
  .command("sourcemap")
  .description("Sourcemap commands")
  .command("upload <dir>")
  .description("Upload all .map files in <dir> for a project release")
  .requiredOption("--project <slug>", "project slug")
  .requiredOption("--release <id>", "release identifier (e.g. git commit SHA)")
  .option("--ext <pattern>", "file extensions to include (default: .map)", ".map")
  .action(async (dir: string, o: { project: string; release: string; ext: string }) => {
    const cfg = await loadConfig();
    const exts = o.ext.split(",").map((s) => s.trim()).filter(Boolean);
    const files = await collectFiles(dir, exts);
    if (files.length === 0) { console.error(`no files in ${dir}`); process.exit(2); }

    const manifest = await Promise.all(
      files.map(async (full) => {
        const st = await stat(full);
        return {
          full,
          relpath: relative(dir, full),
          sizeBytes: st.size,
          contentType: full.endsWith(".js")
            ? "application/javascript"
            : full.endsWith(".map")
              ? "application/json"
              : "application/octet-stream",
        };
      }),
    );

    const res = await api<{
      uploads: Array<{ relpath: string; key: string; url: string; fields: Record<string, string> }>;
      release: string;
    }>(cfg, "/api/mcp/sourcemaps", {
      method: "POST",
      body: JSON.stringify({
        projectSlug: o.project,
        release: o.release,
        files: manifest.map((m) => ({ relpath: m.relpath, sizeBytes: m.sizeBytes, contentType: m.contentType })),
      }),
    });

    let done = 0;
    for (const u of res.uploads) {
      const m = manifest.find((x) => x.relpath === u.relpath);
      if (!m) continue;
      const buf = await readFile(m.full);
      const form = new FormData();
      for (const [k, v] of Object.entries(u.fields)) form.append(k, v);
      form.append("file", new Blob([new Uint8Array(buf)], { type: m.contentType }), m.relpath);
      const up = await fetch(u.url, { method: "POST", body: form });
      if (!up.ok) {
        console.error(`! ${m.relpath}: ${up.status}`);
        continue;
      }
      done++;
      process.stdout.write(`\r  uploaded ${done}/${res.uploads.length}`);
    }
    console.log(`\nrelease ${res.release}: ${done}/${res.uploads.length} files`);
  });

program
  .command("attach <bug-id> [file...]")
  .description("Attach a local file (OS recording) to a bug or task")
  .option("--latest [dir]", "attach the most-recent video. Defaults to the OS screenshots/recordings folder.")
  .action(async (bugId: string, files: string[], o: { latest?: string | boolean }) => {
    const cfg = await loadConfig();
    let resolved: string[] = files;
    if (resolved.length === 0 && o.latest !== undefined) {
      const dir = typeof o.latest === "string" ? o.latest : defaultRecordingDir();
      resolved = [await mostRecentVideo(dir)];
    }
    const list = resolved;
    if (list.length === 0) { console.error("no file"); process.exit(2); }
    for (const f of list) {
      const st = await stat(f);
      const buf = await readFile(f);
      const name = f.split("/").pop() ?? "file";
      const contentType = guessMime(name);
      const kind = contentType.startsWith("video/")
        ? "video"
        : contentType.startsWith("audio/")
          ? "audio"
          : "screenshot";
      const presign = await api<{
        attachmentId: string;
        upload: { url: string; fields: Record<string, string>; key: string };
      }>(cfg, `/api/mcp/bugs/${bugId}/attach`, {
        method: "POST",
        body: JSON.stringify({
          filename: name,
          contentType,
          sizeBytes: st.size,
          kind,
        }),
      });
      const form = new FormData();
      for (const [k, v] of Object.entries(presign.upload.fields)) form.append(k, v);
      form.append("file", new Blob([new Uint8Array(buf)], { type: contentType }), name);
      const up = await fetch(presign.upload.url, { method: "POST", body: form });
      if (!up.ok) {
        console.error(`upload failed: ${up.status}`);
        process.exit(1);
      }
      console.log(`attached ${name} (${kind}, ${st.size}B) → ${bugId}`);
    }
  });

await program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

// ---- helpers ---------------------------------------------------------------

function configPath(): string {
  return join(homedir(), ".quad", "config.json");
}

async function writeConfig(c: Config): Promise<void> {
  await mkdir(join(homedir(), ".quad"), { recursive: true, mode: 0o700 });
  await writeFile(configPath(), JSON.stringify(c, null, 2), { mode: 0o600 });
}

async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(configPath(), "utf8");
    return JSON.parse(raw) as Config;
  } catch {
    console.error("not configured. run: quad login --endpoint <url> --key qd_mcp_...");
    process.exit(2);
  }
}

async function api<T>(cfg: Config, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${cfg.endpoint}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

function guessMime(filename: string): string {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "mp4": return "video/mp4";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    case "mkv": return "video/x-matroska";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "m4a": return "audio/mp4";
    case "ogg": return "audio/ogg";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    default: return "application/octet-stream";
  }
}

async function collectFiles(root: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (exts.some((ext) => e.name.endsWith(ext))) out.push(full);
    }
  }
  await walk(root);
  return out;
}

function defaultRecordingDir(): string {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return home; // Cmd+Shift+5 saves to Desktop; users often re-save to ~/Movies
    case "win32":
      // Win+G "Captures" lives under Videos\Captures
      return join(home, "Videos", "Captures");
    default:
      return join(home, "Videos");
  }
}

async function mostRecentVideo(dir: string): Promise<string> {
  // Expand ~ on POSIX and convert forward/back slashes on Windows.
  const raw = dir.startsWith("~") ? dir.replace(/^~/, homedir()) : dir;
  const root = process.platform === "win32"
    ? raw.replace(/\//g, pathSep)
    : raw;
  const entries = await readdir(root);
  const candidates = entries.filter(
    (n) =>
      /\.(mp4|mov|webm|mkv)$/i.test(n) ||
      /Screen[ _]Recording.*\.mov$/i.test(n) ||
      /^.*\.(mp4|mov)$/i.test(n), // Win+G captures: <Game> <date>.mp4
  );
  if (candidates.length === 0) throw new Error(`no video files in ${root}`);
  const withStat = await Promise.all(
    candidates.map(async (n) => {
      const full = join(root, n);
      const st = await stat(full);
      return { full, mtime: st.mtimeMs };
    }),
  );
  withStat.sort((a, b) => b.mtime - a.mtime);
  return withStat[0]!.full;
}

// quiet unused
void tmpdir;
void mkdtemp;
void spawnSync;

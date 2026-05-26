# 📜 Changelog

All notable changes to this project will be documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the repo follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once a 1.0 is
tagged.

## [Unreleased]

### Added

- **Phase 1 end-to-end** — Reporter → Maintainer → Claude Code loop is
  complete and self-host ready.
- **Web SDK (`@quad/sdk`)** — Shadow-DOM widget, Bug Mode + `Option/Alt+Click`
  pin, Capture session (screen + mic + STT + DOM event trail on one
  ms-aligned timeline), drag/drop attach, clipboard paste. Zero runtime
  dependencies. ~45 KB ESM.
- **MCP server (`@quad/mcp`)** — 10 tools, including image content type so
  vision-capable agents receive key frames inline:
  `quad_list_tasks` · `quad_pick_task` · `quad_get_task` · `quad_update_task` ·
  `quad_post_comment` · `quad_search_tasks` · `quad_get_frames` ·
  `quad_get_transcript` · `quad_get_timeline` · `quad_get_source`.
- **CLI (`@quad/cli`)** — `login` · `list` · `pull` · `status` · `comment` ·
  `attach` (with `--latest <dir>` for OS recordings) · `sourcemap upload`.
- **Dashboard** — 19 pages, board with `h/j/k/l/1-4/Enter` keyboard nav,
  video player with timeline pins + STT sync, 4-column triage flow,
  members, API keys, instance settings, audit log, MCP key issuance,
  command palette (`⌘K`). Pretendard + Tailwind + Minimal Cosmos tokens.
- **Self-host first** — `./scripts/quickstart.sh` boots Postgres + MinIO +
  the app via Docker Compose in under a minute. Railway one-click deploy.
  Guides for EC2, Fly, raw Docker.
- **Server-side deterministic preprocessing** — FFmpeg keyframes + Whisper
  STT + source-map resolution + timeline merge. **No vision / chat /
  embedding calls.**
- **Auth** — email + password (argon2id), HMAC-signed cookie sessions,
  Super Admin bootstrap via `.env`, invitation token redemption on signup.
- **Single-instance architecture** — no multi-tenant workspaces. Large
  orgs run multiple instances.

### Security

- API key hashes (SHA-256) only — plain key shown once on issuance.
- Origin allowlist + 240 req/min per SDK key.
- Object storage private only; all access via short-lived presigned URLs.
- PII masking by default (`<input type=password>` + custom selectors via
  SDK `mask` option). Network capture strips Authorization/Cookie headers.
- Audit log for every privileged action.

---

Maintained by [**Conscience Technology**](https://conscience.technology).

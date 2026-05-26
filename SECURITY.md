# Security policy

## Supported versions

Quad is pre-1.0. The latest `main` branch is the only supported version.
Once we tag a 1.0, this policy will be expanded with version ranges.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Instead, email **security@quad.dev** (or, while that mailbox is being set
up, open a GitHub Security Advisory: <https://github.com/YOU/quad/security/advisories/new>).

Please include:

- A short description of the issue
- Steps to reproduce (or a proof-of-concept)
- The commit SHA you tested against
- Your assessment of impact (data exposure, RCE, privilege escalation, etc.)

We'll acknowledge within 72 hours and aim to ship a fix within 14 days for
high-severity issues. Coordinated disclosure is appreciated.

## Hardening — what Quad already does

These are the security properties Quad commits to. If you find an
attack that breaks any of them, it qualifies as a vulnerability:

1. **API keys never leave the DB as plaintext.** SHA-256 hash + UI prefix
   only. The plain key is shown once on issuance and never again.
2. **SDK keys are scoped per project + origin-checked.** Browser exposure
   is the design — protection is the `allowed_origins` list + per-key rate
   limit (`240 req/min`).
3. **MCP keys are user-scoped with explicit project allowlist** and
   expire (default 90 days, configurable, revocable).
4. **Sessions are HMAC-signed cookies.** Rotating `SESSION_SECRET`
   invalidates every session.
5. **Object storage is private only.** All access goes through short-lived
   presigned URLs (15 min upload, 5–10 min download).
6. **PII is masked at capture time.**
   - `<input type="password">` and `mask: [selector...]` selectors are blurred
     in screenshots / video.
   - Network capture strips `Authorization` and `Cookie` headers + URL
     credentials.
   - `input` events record selector + length **only** — never the value.
   - The SDK never reads host cookies / localStorage.
7. **No server-side LLM beyond Whisper STT.** No vision / chat / embedding
   calls — verified by code review on every PR.
8. **Audit log** records every API key issue/revoke, member role change,
   invite, project create/delete, instance settings change, and bug
   confirm → task transition. See `/admin/audit`.

## Out of scope

- Vulnerabilities in upstream dependencies (please report to them directly,
  and let us know so we can pin / patch quickly).
- DoS attacks that require exhausting the host's resources — Quad inherits
  host-level rate limits.
- Social engineering against the super admin email.

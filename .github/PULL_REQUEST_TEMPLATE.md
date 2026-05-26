## Summary

<!-- One paragraph: what does this change, and why? -->

## Checklist

- [ ] `pnpm -r typecheck` clean
- [ ] `pnpm --filter @quad/web build` succeeds with placeholder envs
- [ ] No new runtime dependency in `packages/sdk` (zero-dep target)
- [ ] No new `fetch("https://api.openai.com/v1/(chat|images|embeddings|...)")` anywhere on the server (Whisper STT is the only allowed LLM call)
- [ ] If you touched a route handler or migration, `docker compose up` from a fresh clone still works
- [ ] If you changed semantics, [`spec.md`](../spec.md) was updated to match
- [ ] Screenshots / a short clip if there's a UI change

## Related

<!-- Linked issues, PRs, or external context -->

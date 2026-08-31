# Phase 3. Code Lane и preview

- **Статус:** foundation implemented, target incomplete

## Реализовано

Durable execution jobs, short-lived capability, isolated Git worktree,
workspace-write Codex turn, path/diff gates, server-owned checks, independent
review, implementation acceptance, clean replay, service commit, sanitized
loopback preview, browser readiness, preview acceptance и draft Pull Request
source promotion.

## Осталось до exit

- универсальные code capabilities для page/design/module/plugin/schema tasks;
- protected core/system scopes и policy projection из Phase 2;
- dependency and migration evidence как first-class contracts;
- profile-specific preview test packs;
- bounded network/sandbox proof в production worker topology;
- complete cleanup/retry/recovery SLO;
- end-to-end scenarios: новая страница, schema migration и project plugin.

Exit требует, чтобы принятый diff воспроизводился из clean source, preview был
связан с exact config/commit hashes, а out-of-scope изменение блокировалось.

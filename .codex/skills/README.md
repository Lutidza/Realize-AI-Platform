# Скилы Codex

`.codex/skills/` хранит исполняемые скилы Codex для проекта `Realize — AI Platform`.

## Границы

- Активные правила живут в `.ai/rules/*`.
- Проверки живут в `.ai/checks/*`.
- Скил описывает процедуру Codex, но не вводит новое project rule.
- Секреты, токены и runtime state не хранятся в skills.

## Текущие скилы

- `next-react-frontend-architecture` - Next.js/React/Tailwind UI boundaries.
- `payload-next-contracts-first` - Payload/Next API and data contract work.
- `codex-external-worker-session` - external Codex worker session lifecycle.
- `code-comment-discipline` - TSDoc/comment discipline.
- `dto-contracts-first` — публичные DTO и мапперы у фактического владельца.
- `feature-decomposition-guard` — структура кода и разделение ответственности.
- `frontend-guardrail-audit` - read-only audit of frontend guardrails.
- `frontend-runtime-evidence` - choose static/build/browser evidence tier.
- `git-commit-push` — inspect/manage, commit/fetch/pull/push через отдельного воркера, HTTPS/SSH.
- `reference-to-implementation` - reference/screenshot/current-page parity.
- `skill-documentation-sync` - sync `.ai`, `.codex` and docs artifacts.

Stale skills from transferred layers must be renamed, rewritten or removed
instead of kept as active aliases.

## Обновление

При добавлении или изменении skill обнови этот README и связанные
`.ai/registry/*`, role cards or workflows.

# Роль: Developer Backend (`ai-role-developer-backend`)

```yaml
artifact_id: ai-role-developer-backend
artifact_type: ai-role-index
owner_layer: .ai/roles/developer/backend/
runtime_sources:
  - documentation/project-context.md
  - .ai/rules/development/RULE-DEVELOPMENT-STRICT-PRINCIPLES.md
  - .ai/rules/development/backend/
  - .ai/checks/development/backend/
  - .ai/registry/rules/development/backend/INDEX.md
related_skills:
  - .codex/skills/payload-next-contracts-first/SKILL.md
  - .codex/skills/dto-contracts-first/SKILL.md
  - .codex/skills/code-comment-discipline/SKILL.md
  - .codex/skills/feature-decomposition-guard/SKILL.md
```

Владеет Payload schema/config, access/hooks/migrations и server/API logic:
`src/payload.config.ts`, `src/collections/**`, `src/plugins/**`,
`src/migrations/**`, `src/app/(app)/api/**`, `src/utilities/**`, а также
соответствующими `packages/**` и `services/**` owners.

- Найди текущие field factories, hooks, access, resolver и consumers до правки.
- Сохраняй Payload/Next patterns и migration workflow. Generated types меняй
  генератором при реальном schema change.
- Public DTO и mapper принадлежат соответствующему feature/package.
  AI contracts: `packages/ai-contracts/**`; raw Payload documents не должны
  становиться новым публичным контрактом.
- Search/cache/geo требования применяй только когда такой контур существует
  и затронут задачей; проверь его фактическую реализацию.
- При UI-visible изменении подключи frontend owner.

Проверки выбирай по затронутому контракту: targeted test для существенной
логики, typecheck для TS boundary, generated types для schema и migration
checks для DB changes. Не выполняй общий lint/test/build/reindex или DB probe
для каждой backend-задачи. Повторная проверка нужна при изменении diff,
ошибке либо новой неопределённости.

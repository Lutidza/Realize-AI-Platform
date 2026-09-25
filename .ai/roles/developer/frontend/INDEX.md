# Роль: Developer Frontend (`ai-role-developer-frontend`)

```yaml
artifact_id: ai-role-developer-frontend
artifact_type: ai-role-index
owner_layer: .ai/roles/developer/frontend/
runtime_sources:
  - documentation/project-context.md
  - .ai/rules/development/frontend/
  - .ai/checks/development/frontend/
related_workflows:
  - .ai/workflows/frontend/next-react/guardrail/WORKFLOW.md
  - .ai/workflows/frontend/design-workshop/WORKFLOW.md
related_skills:
  - .codex/skills/next-react-frontend-architecture/SKILL.md
  - .codex/skills/dto-contracts-first/SKILL.md
  - .codex/skills/frontend-runtime-evidence/SKILL.md
  - .codex/skills/reference-to-implementation/SKILL.md
  - .codex/skills/design-workshop/SKILL.md
  - .codex/skills/feature-decomposition-guard/SKILL.md
```

Владеет Next.js/React UI: `src/app/(app)/**`, `src/components/**`,
`src/providers/**` и UI helpers в `src/utilities/**`. Payload Admin plugin UI
имеет владельца в `packages/payload-ai-plugin/**`; точный путь находи в коде.

- Найди route/component/theme owner и существующий pattern до правки.
- Явно различай Server/Client Components; сохраняй project UI primitives.
- Для изменения data/API shape подключи backend owner и существующий DTO
  contract. AI DTO находятся в `packages/ai-contracts/**`; другие контракты
  ищи у фактического feature owner, не создавай target directories автоматически.
- Выбери проверки по риску через frontend-runtime-evidence skill. Rendering,
  CSS, interaction и visual parity требуют относящегося к задаче browser
  evidence; документация и нетронутые сценарии не требуют UI suite.
- Применяй boundary/reuse/reference rules только к затронутой границе.

Роль не владеет schema/migrations/indexing или agent-monitor tooling.
Наличие role card не требует отдельного worker или guardrail audit.

Для целостного дизайн-проекта, набора компонентов или темы используй также
[Workshop Director](../../design/workshop-director/INDEX.md). Он связывает
бриф, направление и передачу версии; инженерные владельцы UI остаются прежними.

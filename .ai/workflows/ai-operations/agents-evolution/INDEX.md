# Workflow agents evolution (`agents-evolution`)

```yaml
artifact_id: agents-evolution-workflow-directory-index
artifact_type: ai-workflow-directory-index
owner_layer: .ai/workflows/ai-operations/agents-evolution/
runtime_sources:
  - .ai/workflows/ai-operations/agents-evolution/WORKFLOW.md
  - .ai/agents-evolution/INDEX.md
related_artifacts:
  - .ai/agents-evolution/
  - .ai/rules/
  - .ai/checks/
  - .ai/workflows/
  - .ai/templates/
  - .codex/skills/
```

Основной entrypoint — `WORKFLOW.md`: короткая реализация явно запрошенной
правки AI-слоя и отдельный optional proposal route для будущих решений.

Дополнительные материалы открывай по необходимости:

- `states/` — детали выбранного состояния;
- `gates/` — evidence, owner, dedup и sync;
- `transitions/` — переходы долговременного proposal;
- `outputs/` — форматы optional artifacts;
- `adapters/` — связи с Codex skills.

Наличие этих файлов не требует чтения всей директории, отдельного observation,
proposal и applied-change для каждой правки. Текущие instructions находятся
в owners rules/checks/workflows/skills, а не в историческом trace.

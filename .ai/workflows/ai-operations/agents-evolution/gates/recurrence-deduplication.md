# Recurrence and deduplication gate (`recurrence_deduplication`)

```yaml
artifact_id: agents-evolution-gate-recurrence-deduplication
artifact_type: ai-workflow-gate
owner_layer: .ai/workflows/ai-operations/agents-evolution/gates/
owner_role: .ai/roles/process-tools-operations/ai-evolution-steward/INDEX.md
related_tools:
  - rg
  - .ai/tools/agent-search/
```

До нового правила найди существующее покрытие через targeted search.
Не превращай каждый одиночный code bug в глобальный guardrail. Уточни или
удали существующий текст, если проблема в нём.

Fingerprint/recurrence score и поиск исторических proposals нужны лишь для
устойчивого pattern или future proposal; явный запрос на исправление инструкции
не требует повторного инцидента и не блокируется отсутствием recurrence.

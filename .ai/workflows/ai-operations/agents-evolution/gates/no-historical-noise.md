# No historical noise gate (`no_historical_noise`)

```yaml
artifact_id: agents-evolution-gate-no-historical-noise
artifact_type: ai-workflow-gate
owner_layer: .ai/workflows/ai-operations/agents-evolution/gates/
related_rule: .ai/rules/development/RULE-NO-HISTORICAL-NOISE.md
```

В active instructions оставь текущий actionable contract. Исторические
observations/proposals могут объяснять прошлый выбор, но не переопределяют
новое поведение. Не копируй incident rationale или logs в правила; существующее
историческое evidence не удаляй при обычной синхронизации.

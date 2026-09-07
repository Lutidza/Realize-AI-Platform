# Regression risk gate (`regression_risk`)

```yaml
artifact_id: agents-evolution-gate-regression-risk
artifact_type: ai-workflow-gate
owner_layer: .ai/workflows/ai-operations/agents-evolution/gates/
```

Проверь, не добавляет ли изменение дублирование, новые обязательные чтения,
неприменимые tests/comments/reports или повторные approvals. Убедись, что
сохраняются авторизация, проверки по реальному риску и cleanup внешних
процессов. Для статических инструкций достаточно targeted scan и walkthrough;
новый executable contract проверяется соответствующим tool/test.

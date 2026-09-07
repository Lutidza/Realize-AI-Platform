# Контракт lifecycle-артефактов (`lifecycle_artifact_output`)

```yaml
artifact_id: agents-evolution-output-lifecycle-artifact
artifact_type: ai-workflow-output
owner_layer: .ai/workflows/ai-operations/agents-evolution/outputs/
```

Все evolution outputs optional: создавай один полезный документ вместо
обязательной цепочки observation/proposal/applied. Он содержит evidence,
owner, решение и проверки, с references вместо raw logs. Исторический
artifact не становится active behavior и не заменяет разрешение пользователя.

# Apply change (`apply_change`)

```yaml
artifact_id: agents-evolution-state-apply-change
artifact_type: ai-workflow-state
owner_layer: .ai/workflows/ai-operations/agents-evolution/states/
```

Примени разрешённую правку в owner-layer, удали заменённые инструкции и
синхронизируй прямых consumers. Явно запрошенная задача не требует предварительно
созданного accepted-proposal файла. Выход: diff и результат нужных проверок.

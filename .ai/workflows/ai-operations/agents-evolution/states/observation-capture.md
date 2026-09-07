# Observation capture (`observation_capture`)

```yaml
artifact_id: agents-evolution-state-observation-capture
artifact_type: ai-workflow-state
owner_layer: .ai/workflows/ai-operations/agents-evolution/states/
```

Optional state для факта, который полезно сохранить на будущее. Запиши
sanitized summary, evidence refs, affected owner и следующий шаг. Fingerprint
нужен лишь для поиска повторяемого pattern. Не создавай observation, если
запрошенная правка уже описана задачей/diff/report.

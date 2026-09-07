# Documentation sync gate (`documentation_sync`)

```yaml
artifact_id: agents-evolution-gate-documentation-sync
artifact_type: ai-workflow-gate
owner_layer: .ai/workflows/ai-operations/agents-evolution/gates/
```

Проверь прямых consumers изменённого контракта: rules/checks, workflow,
registry/roles и Codex adapters. Удали stale references. Canonical product docs
обновляй лишь если затронут их контракт. Один diff/report достаточно отражает
результат; отдельный lifecycle trace и полный documentation audit не нужны.

# Проверки управления и синхронизации Git

```yaml
artifact_id: ai-checks-git-index
artifact_type: ai-check-index
owner_layer: .ai/checks/git/
checks:
  - .ai/checks/git/CHECK-GIT-MANAGEMENT-SCOPE.md
  - .ai/checks/git/CHECK-GIT-SYNC-READINESS.md
```

Подключаются по выбранному действию
[Git workflow](../../workflows/delivery/git/commit-push/WORKFLOW.md).
Проверки commit и push остаются в `pre-commit/` и `pre-push/`.

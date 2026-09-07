# Worker profiles

```yaml
artifact_id: ai-worker-profiles-index
artifact_type: ai-worker-profile-index
owner_layer: .ai/worker-profiles/
```

Reusable profiles помогают повторяющимся назначениям; они необязательны.
Сейчас materialized profiles нет: используй подходящую role card и короткий
task-specific assignment.

Новый profile полезен при повторяемом контуре. Он ссылается на актуальные
rules/checks/workflow и не дублирует их bodies. Scope конкретного задания
определяется пользовательским запросом и assignment, а не самим profile.

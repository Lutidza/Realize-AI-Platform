# Check: переиспользование перед локальной backend-реализацией

```yaml
check_id: CHECK-BACKEND-REUSE-BEFORE-LOCAL-IMPLEMENTATION
owner_layer: .ai/checks/development/backend/
related_rule:
  - .ai/rules/development/backend/RULE-BACKEND-REUSE-BEFORE-LOCAL-IMPLEMENTATION.md
report: shared_task_result
```

## Условия прохождения

- Выполнен `rg` или эквивалентный scan по affected backend contour.
- Existing pattern либо выбран как owner, либо явно объяснён local exception.
- Новый owner не дублирует существующий mapper, service, access helper, hook,
  field factory, компонент Payload Admin, query, cache policy или provider.

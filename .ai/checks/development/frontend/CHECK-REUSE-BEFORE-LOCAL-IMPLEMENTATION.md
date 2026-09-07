# Check: reuse before local frontend implementation

```yaml
check_id: CHECK-REUSE-BEFORE-LOCAL-IMPLEMENTATION
owner_layer: .ai/checks/development/frontend/
related_rule:
  - .ai/rules/development/frontend/RULE-REUSE-BEFORE-LOCAL-IMPLEMENTATION.md
report: shared_task_result
```

## Pass Condition

- Выполнен `rg` или эквивалентный scan по affected frontend contour.
- Existing pattern либо выбран как owner, либо явно объяснён local exception.
- Новый owner не дублирует существующий partial/script/style/component.

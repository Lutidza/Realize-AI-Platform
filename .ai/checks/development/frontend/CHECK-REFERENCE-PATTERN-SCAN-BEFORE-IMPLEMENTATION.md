# Check: reference pattern scan before implementation

```yaml
check_id: CHECK-REFERENCE-PATTERN-SCAN-BEFORE-IMPLEMENTATION
owner_layer: .ai/checks/development/frontend/
related_rule:
  - .ai/rules/development/frontend/RULE-REFERENCE-PATTERN-SCAN-BEFORE-IMPLEMENTATION.md
report: shared_task_result
```

## Pass Condition

- Reference source указан явно.
- Проверены текущие аналоги в application frontend contour.
- Перед правкой выбран owner-layer для каждого mismatch.

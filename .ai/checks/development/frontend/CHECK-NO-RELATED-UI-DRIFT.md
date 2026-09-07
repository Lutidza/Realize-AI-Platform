# Check: no related UI drift

```yaml
check_id: CHECK-NO-RELATED-UI-DRIFT
owner_layer: .ai/checks/development/frontend/
related_rule:
  - .ai/rules/development/frontend/RULE-NO-RELATED-UI-DRIFT.md
report: shared_task_result
```

## Pass Condition

- Affected frontend surfaces перечислены.
- Unrelated drift либо исключён, либо зафиксирован как risk/blocker.

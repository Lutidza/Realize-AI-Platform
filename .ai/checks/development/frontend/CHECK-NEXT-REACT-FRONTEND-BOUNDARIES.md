# Check: Next/React frontend boundaries

```yaml
check_id: CHECK-NEXT-REACT-FRONTEND-BOUNDARIES
owner_layer: .ai/checks/development/frontend/
related_rule:
  - .ai/rules/development/frontend/RULE-NEXT-REACT-FRONTEND-BOUNDARIES.md
report: shared_task_result
```

## Pass Condition

- Source owner выбран до правки.
- Server/Client Component boundary определён.
- Правка сохраняет Next.js App Router, React and project UI conventions.
- Затронутые API и настройки Next.js сверены с документацией установленной версии.
- API/data/search contract не меняется из frontend role без backend role.

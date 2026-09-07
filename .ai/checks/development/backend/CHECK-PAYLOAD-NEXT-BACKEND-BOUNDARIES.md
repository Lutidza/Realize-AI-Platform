# Check: границы Payload/Next backend

```yaml
check_id: CHECK-PAYLOAD-NEXT-BACKEND-BOUNDARIES
owner_layer: .ai/checks/development/backend/
related_rule:
  - .ai/rules/development/backend/RULE-PAYLOAD-NEXT-BACKEND-BOUNDARIES.md
report: shared_task_result
```

## Условия прохождения

- Source owner выбран до правки.
- Boundary type определён: Payload schema, migration, API transport, data
  resolver, domain service, search/indexing или cache.
- Payload CMS 3, Next.js App Router и project data conventions сохранены.
- При изменении Next.js затронутые API и настройки сверены с документацией
  установленной версии.
- Generated files не редактируются вручную.
- Consumer contract не меняется без соответствующей role/owner проверки.

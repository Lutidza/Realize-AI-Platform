# Check: сначала Payload/data contract

```yaml
check_id: CHECK-PAYLOAD-DATA-CONTRACT-FIRST
owner_layer: .ai/checks/development/backend/
related_rule:
  - .ai/rules/development/backend/RULE-PAYLOAD-DATA-CONTRACT-FIRST.md
report: shared_task_result
```

## Условия прохождения

- Changed contract назван до реализации.
- Source of truth определён.
- Для DB/schema изменения есть migration/schema workflow decision.
- Schema push выбран только для явно согласованной одноразовой локальной БД;
  в остальных случаях изменения выполняются миграциями Payload.
- При изменении геополей подтверждён используемый механизм и проверено влияние
  на потребителей; PostGIS не предполагается по одному названию сценария.
- Для Payload schema изменения есть generated types decision.
- Affected consumers перечислены или обоснованно отсутствуют.
- `src/payload-types.ts` не редактируется вручную.

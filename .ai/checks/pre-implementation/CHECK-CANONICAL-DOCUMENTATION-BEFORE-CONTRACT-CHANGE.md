# CHECK-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE

```yaml
artifact_id: CHECK-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE
artifact_type: ai-pre-implementation-check
owner_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
  - .ai/roles/process-tools-operations/documentation-steward/INDEX.md
owner_layer: .ai/checks/pre-implementation/
rule: .ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
registry: .ai/registry/rules/INDEX.md
check_stage: pre_implementation_canonical_documentation_gate
rule_scope: project-wide
scope: contract_level_changes
```

## Проверка перед изменением

Применимость и выбор canonical source определяет связанное
[правило](../../rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md).
Диалог, read-only анализ и неконтрактная правка не требуют spec alignment.

Для изменения контракта проверь:

- назван затронутый контракт и его фактический владелец;
- выбран ближайший источник: product/architecture doc либо активная инструкция
  рабочего слоя, когда меняется её собственное поведение;
- определено, достаточен ли источник (`canonical_doc_decision`);
- необходимые изменения владельца и прямых потребителей входят в разрешённую
  область и выполнены; недостаточность документа не скрыта;
- если синхронизация отложена, есть явное разрешение, owner и следующий шаг.

Отсутствующая внешняя спецификация не блокирует правку активного правила,
которое само является источником требования. Не используй task, audit, README
или комментарий для подмены предметного контракта. Не требуй повторного
подтверждения уже разрешённой синхронизации документации.

Результат: `passed`, `not_required`, `failed` либо `stop-for-approval`, если
необходимое действие не разрешено. Укажи причину непрохождения в общем итоге;
проверка не требует самостоятельного отчёта или полного аудита документации.

# CHECK-DEVELOPMENT-STRICT-PRINCIPLES

```yaml
artifact_id: CHECK-DEVELOPMENT-STRICT-PRINCIPLES
artifact_type: ai-development-check
owner_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
owner_layer: .ai/checks/development/
rule: .ai/rules/development/RULE-DEVELOPMENT-STRICT-PRINCIPLES.md
related_rules:
  - .ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
workflow: .ai/workflows/core/main-delivery/WORKFLOW.md
check_stage: development_strict_gate
rule_scope: project-wide
scope: all_work_tasks
```

## Применимость

Используется как часть подготовки и итогового review рабочей задачи.
Не требует отдельного workflow, worker, approval или повторного чтения уже
известного контекста. Для обычного диалогового ответа не применяется.

## Условия прохождения

- Изменён правильный owner, использованы актуальные contracts и подходящие
  существующие механизмы.
- Изменение завершает поставленную задачу в её scope, без постороннего
  рефакторинга, конкурирующих owners и искусственной декомпозиции.
- Существенные access/auth, DTO, persistence и migration ограничения сохранены.
- Реальные секреты не добавлены в исходники, инструкции, документацию или
  результат диагностики; автоматически создаваемые файлы обновлены генератором,
  если их изменение требуется.
- При изменении Next.js затронутые API и настройки сверены с документацией
  установленной версии; недоступность нужного источника не скрыта.
- Проверки соответствуют риску по матрице связанного rule; уже достаточные
  успешные проверки не повторяются без нового основания.
- Затронутые ссылки и consumers синхронизированы, факт выполнения и ограничения
  переданы честно.

Длина файла и relative imports сами по себе не являются failure. Дополнительные
инструменты и full suite нужны только для конкретного непроверенного риска или
обязательного CI/release gate. В общий результат включай findings, проверки и
существенные ограничения; отдельная таблица статусов не нужна.

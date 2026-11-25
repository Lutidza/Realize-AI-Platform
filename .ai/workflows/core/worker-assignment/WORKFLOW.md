# Workflow: worker assignment (`worker-assignment-workflow`)

```yaml
artifact_id: worker-assignment-workflow
artifact_type: ai-workflow
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/core/worker-assignment/
runtime_sources:
  - .ai/workflows/core/worker-session/WORKFLOW.md
related_rules:
  - .ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md
  - .ai/rules/worker-runtime/RULE-WORKER-MODEL-SELECTION.md
  - .ai/rules/worker-runtime/RULE-WORKER-CONTEXT-BUDGET-AND-REUSE.md
  - .ai/rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md
  - .ai/rules/worker-runtime/RULE-WORKER-NO-SCOPE-EXPANSION.md
  - .ai/rules/worker-runtime/RULE-WORKER-HANDOFF-CONTRACT.md
related_checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-PROFILE-REFERENCES.md
  - .ai/checks/worker-runtime/CHECK-WORKER-ASSIGNMENT-SCOPE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-MODEL-SELECTION.md
  - .ai/checks/worker-runtime/CHECK-WORKER-CONTEXT-BUDGET-REUSE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md
  - .ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-DIALOG-SURFACE-BUDGET.md
  - .ai/checks/worker-runtime/CHECK-WORKER-HANDOFF-READY.md
```

Применяется только при фактическом делегировании. Не требует отдельного агента
для repository search, coordinator или review каждого изменения.

1. Выдели независимую подзадачу, полезную параллельно основной работе. Для
   reviewer обеспечь независимость от автора проверяемой реализации.
2. Передай компактный assignment по `RULE-WORKER-ASSIGNMENT-MANIFEST`:
   цель, source/owner, пути, write mode, checks, результат и адресат.
3. Используй native collaboration, когда оно доступно и подходит задаче.
   Внешний `codex exec` выбери по необходимости, затем подключи worker-session
   workflow и `.codex/skills/codex-external-worker-session/SKILL.md`.
4. Переиспользуй подходящую сессию; модель обычно наследуется. Не добавляй
   profile/context/model metadata, которые не нужны выбранному tool.
5. Выполняй независимую часть работы, принимай сообщения и разрешай пересечения
   scope. Follow-up внутри авторизованной задачи не требует нового user approval.
6. Получи bounded result, проверь существенный diff и нужные checks, закончи
   обязательную работу. Lifecycle завершения — в worker-session workflow.
7. Собери один ответ пользователю с результатом и ограничениями.

Для optional managed external runtime manifest/group поля и preflight задаются
реальным writer/schema этого режима. Не переноси его SQLite/monitor ceremony
на native agents. Проверки model/profile/monitor выполняй только при наличии
соответствующего override, profile или managed runtime.

## Подготовка назначения

Для предпросмотра пакета выполни `npm run --silent ai:assignment -- prepare`.
Состав вывода, параметры и коды завершения описаны в
[README инструмента](../../../tools/worker-assignment/README.md).
Готовность определяет [правило назначения](../../../rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md#готовность-к-запуску).

При поручении привязать пакет выполни `npm run --silent ai:assignment -- bind`.
Для повторной проверки того же контекста передай `bind --context <contextId>`.
Сверь идентичность, доставку и права в ответе. Запуск исполнителя требует
отдельного поручения и должен использовать проверенный контекст.

## Независимое ревью аудита формы «Создать статью»

| Участник | Ответственность и результат |
| --- | --- |
| Аудитор с ролью [Developer Frontend](../../../roles/developer/frontend/INDEX.md) | Выполняет статический аудит и передаёт оркестратору карту обязанностей, замечания с доказательствами и ограничения. |
| Независимый frontend-ревьюер | Другой специалист с компетенцией Developer Frontend, независимый от автора реализации и автора отчёта. Сверяет выводы и покрытие с закреплёнными исходниками и возвращает оркестратору заключение с конкретными расхождениями либо подтверждением. |
| Оркестратор | Назначает участников, формирует отдельные контексты с правами чтения и связывает отчёт, заключение и факты выполнения с соответствующими назначениями. Принимает аудит, возвращает конкретный пункт на уточнение или сообщает о препятствии. |

Это два последовательных назначения. После получения отчёта оркестратор
готовит для ревьюера собственное назначение и контекст с отчётом аудитора,
применимыми правилами, теми же версиями исходников и сведениями о фактических
чтениях. Ревьюер отвечает за техническое заключение. Оркестратор отвечает
за соблюдение области, полноту процедуры и итоговое решение. Обнаруженное
нарушение совместимо с принятым аудитом.

Критерии для этого примера указаны в [шаблоне назначения](../../../templates/worker-assignment/TEMPLATE-WORKER-ASSIGNMENT-MANIFEST.md#приёмка-аудита-формы).

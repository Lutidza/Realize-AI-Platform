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

## Общий порядок делегирования

Этот порядок применяется, когда часть задачи поручают другому исполнителю.

### Подготовка назначения

1. Определи цель подзадачи и её границы. Выбери роль исполнителя и укажи, почему
   она подходит. Назови владельца затронутой области, обязательные источники,
   ожидаемый результат и его получателя.
2. Укажи разрешённые операции, критерии проверки и условия возврата при
   препятствии. Для правки перечисли разрешённые пути. При параллельной записи
   распредели файлы между исполнителями или согласуй порядок изменений.
3. Сверь доступность источников и достаточность прав. Если поручена только
   подготовка, верни назначение для просмотра и заверши работу на этом шаге.
   [Правило назначения](../../../rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md#готовность-к-запуску)

### Передача и приёмка

1. Выбери способ передачи, подходящий задаче. При нативном делегировании
   достаточно сообщения с подготовленным поручением. Переиспользуй подходящую
   сессию. По умолчанию модель наследуется.
2. При передаче через адаптер Realize проверь допуск выбранного исполнителя
   для этой попытки. Для внешнего `codex exec` сохрани идентификатор процесса
   и следуй порядку ожидания и завершения. Параметры профиля и модели проверяй
   при их явном выборе. Для управляемого внешнего режима применяй его схему
   манифеста, предварительные проверки и мониторинг.
   [Допуск адаптера](../../../rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md#допуск-через-адаптер-realize) · [Жизненный цикл сессии](../worker-session/WORKFLOW.md) · [Процедура внешнего Codex](../../../../.codex/skills/codex-external-worker-session/SKILL.md)
3. Пока исполнитель работает, продолжай независимую часть задачи и разрешай
   пересечения областей работы. Уточнения передавай в рамках уже выданных полномочий.
4. Получи результат, проверь его по критериям назначения. Для правки сверь
   изменённые файлы. После завершения порученной работы сообщи пользователю
   итог, выполненные проверки и существенные ограничения.
   [Правило передачи результата](../../../rules/worker-runtime/RULE-WORKER-HANDOFF-CONTRACT.md)

## Подготовка и привязка через CLI Assignment

Этот раздел применяется при выборе CLI Assignment для режима `static-read-only`.
Укажи в переменной `lockPath` путь к файлу привязки выбранного назначения
от корня проекта. Выбери команду по порученной операции.

- **Предпросмотр пакета.** Выполни `npm run --silent ai:assignment -- prepare --lock "$lockPath"`.
  Проверь состав пакета и причины статуса. Даже полный пакет до привязки получает
  `blocked`. Если поручен только предпросмотр, верни этот результат.
- **Привязка локального контекста.** Выполни `npm run --silent ai:assignment -- bind --lock "$lockPath"`.
  При успехе сохрани выданный `contextId`.
- **Повторное открытие.** Выполни `npm run --silent ai:assignment -- bind --lock "$lockPath" --context "$contextId"`.
  Сверь идентичность назначения, ревизию, хеш привязки, доставленные источники
  и права. При `blocked` сообщи причину.

Успешный `bind` подтверждает готовность локального контекста. Если поручен
также запуск, перед передачей проверь допуск конкретного исполнителя.
[Правило привязки](../../../rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md#привязка-в-cli-assignment) · [Команды и коды завершения](../../../tools/worker-assignment/README.md)

## Независимое ревью статического аудита

Этот порядок применяется, если план статического аудита предусматривает
независимое ревью.

1. Оркестратор назначает аудитора и ревьюера отдельными поручениями.
   Выбирает ревьюера, независимого от автора реализации и автора отчёта.
   Каждому предоставляет собственный контекст с нужными правами чтения.
2. Аудитор публикует отчёт и карту покрытия. В отчёте указывает обязанности
   проверенных файлов, основания для замечаний и ограничения проверки.
   Очередь передаёт опубликованные материалы по действующему назначению ревьюера.
   [Публикация и передача материалов](../../../../documentation/specifications/task-management/execution/audit-report-publication.md)
3. Ревьюер сверяет выводы и покрытие с закреплёнными версиями исходников,
   подтверждает собственные чтения и передаёт оркестратору техническое заключение.
   [Критерии заключения](../../../../documentation/specifications/task-management/execution/review-conclusion.md#что-именно-проверяет-ревьюер)
4. Оркестратор сопоставляет отчёт, заключение и подтверждения выполнения
   с назначениями и критериями приёмки. Принимает результат, возвращает
   конкретный пункт на доработку или сообщает о препятствии. Обоснованное
   замечание к коду может быть результатом успешно завершённого аудита.

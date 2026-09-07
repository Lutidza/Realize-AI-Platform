# Правило: worker assignment manifest (`RULE-WORKER-ASSIGNMENT-MANIFEST`)

```yaml
artifact_id: RULE-WORKER-ASSIGNMENT-MANIFEST
artifact_type: ai-runtime-rule
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/worker-runtime/
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-ASSIGNMENT-SCOPE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-PROFILE-REFERENCES.md
  - .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md
  - .ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-DIALOG-SURFACE-BUDGET.md
  - .ai/checks/worker-runtime/CHECK-WORKER-HANDOFF-READY.md
```

Перед делегированием зафиксируй в assignment message:

- миссию и ожидаемый результат;
- source of truth и owner-layer;
- разрешённые пути, режим чтения/записи и существенные запреты;
- нужные проверки и условие возврата при blocker;
- кому вернуть результат.

Сообщение native collaboration является достаточным assignment. Файл manifest,
profile, group topology, model metadata и числовой context budget нужны только
если их использует выбранный tool/runtime. Не создавай пустые или дублирующие
поля. Шаблон — `.ai/templates/worker-assignment/TEMPLATE-WORKER-ASSIGNMENT-MANIFEST.md`.

Разделяй одновременную запись по файлам; при общей зависимости согласуй порядок.
Профиль помогает выбрать контекст, но scope конкретной задачи определяется
assignment. Проверяй, что write paths укладываются в разрешение пользователя.
Документация является допустимым owner-layer для документационной задачи.

Внешний процесс должен иметь отслеживаемый handle, bounded result и cleanup
по `.ai/workflows/core/worker-session/WORKFLOW.md`. Native agent использует
lifecycle и сообщения своей среды, без дублирования в SQLite/monitor.

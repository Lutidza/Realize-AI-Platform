# Правило: lifecycle worker-сессий (`RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE`)

```yaml
artifact_id: RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE
artifact_type: ai-runtime-rule
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/agent-runtime/
workflow: .ai/workflows/core/worker-session/WORKFLOW.md
checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md
  - .ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-DIALOG-SURFACE-BUDGET.md
  - .ai/checks/self-review/CHECK-WORKER-SESSION-LIFECYCLE-BEFORE-HANDOFF.md
runtime_store: .ai/tools/agent-runtime/runtime/runtime.sqlite
```

Применяй lifecycle к фактически запущенным worker-ам. Для native collaboration
используй handles, сообщения и статусы среды. Direct work не создаёт worker
sessions, bootstrap, store, monitor или maintenance report.

Для внешнего `codex exec` до запуска определи cwd, bounded assignment, результат
и способ остановки; после запуска сохрани process/session handle. Дождись exit,
получи результат и проверь diff. При ошибке, отмене или blocker останови свой
процесс либо передай его явному владельцу с причиной и следующим шагом.
Не оставляй process бесконтрольно работающим после завершения задания.

Если выбран optional managed `agent-runtime` режим, используй его writer/schema:
planned → running → result-ready/needs-review → closed, согласованные resolution
и presence. Завершённая сессия должна иметь terminal decision и offline
presence. Не правь SQLite/projections руками; обязательные поля writer,
notifications и group contracts этого режима сохраняются.

Работа внутри уже разрешённого scope не требует отдельного autonomous grant.
Permission на новый внешний или необратимый шаг определяется инструкциями
пользователя и среды. Эти правила не расширяют полномочия продуктового
execution worker, его approval lanes или доступ к credentials.

В пользовательский диалог передавай полезные progress updates и итог. Messages
trace создавай только по реальной необходимости; private reasoning, secrets,
production dumps и лишние PII туда не попадают.

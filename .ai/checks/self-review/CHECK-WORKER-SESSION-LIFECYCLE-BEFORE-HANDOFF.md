# Проверка: worker lifecycle перед handoff (`CHECK-WORKER-SESSION-LIFECYCLE-BEFORE-HANDOFF`)

```yaml
artifact_id: CHECK-WORKER-SESSION-LIFECYCLE-BEFORE-HANDOFF
artifact_type: ai-self-review-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/self-review/
rule: .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md
workflow: .ai/workflows/core/worker-session/WORKFLOW.md
related_checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md
  - .ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-DIALOG-SURFACE-BUDGET.md
  - .ai/checks/worker-runtime/CHECK-WORKER-HANDOFF-READY.md
runtime_store: .ai/tools/agent-runtime/runtime/runtime.sqlite
```

Применяется, если в текущем задании запускались worker-ы.

1. Проверь handles текущей задачи и получи требуемые результаты. Не закрывай
   чужие сессии и не проверяй глобальный runtime ради локального handoff.
2. Для native collaboration достаточно фактического result/status среды.
   Idle/completed session без незавершённой работы не требует отдельного close.
3. Для внешних процессов подтверди exit, cleanup и проверку результата. Если
   дальнейшая работа согласована, у неё есть явный владелец, handle и next step.
4. Только в managed external режиме проверь writer records, result/critical
   notifications, terminal resolution и presence. Не подменяй обязательные
   поля writer сокращённым текстом.
5. Дай пользователю итог с фактическим статусом работы, checks и blockers.

Fail: бесконтрольный внешний процесс, скрытая незавершённая обязательная работа,
неполученный результат или отсутствие решения по blocker текущего задания.
SQLite bootstrap, monitor, trace и maintenance не нужны direct/native задаче.
Отдельный lifecycle report создаётся только если он запрошен.

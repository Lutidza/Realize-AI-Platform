# Проверка: Codex exec worker runtime bridge (`CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE`)

```yaml
check_id: CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE
title: Проверка runtime bridge для внешних codex exec worker-ов
artifact_type: ai-runtime-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/worker-runtime/
related_rules:
  - .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md
  - .ai/rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md
  - .ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md
related_checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md
  - .ai/checks/worker-runtime/CHECK-WORKER-HANDOFF-READY.md
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
  - .ai/workflows/core/worker-session/WORKFLOW.md
codex_adapter:
  - .codex/skills/codex-external-worker-session/SKILL.md
runtime_store_contract: .ai/tools/agent-runtime/runtime/INDEX.md
runtime_tool: .ai/tools/agent-runtime
execution_backend: codex_exec
status: active
```

Применяется только к внешнему `codex exec`. Для direct/native — not_required;
native collaboration разрешена и не дублируется в project runtime.

Pass для обычного external режима:

- до запуска известны bounded scope, cwd, result target и stop method;
- после запуска сохранён реальный process/session handle;
- результат/exit получены, diff проверен;
- процесс завершён или дальнейшая работа явно передана владельцу.

В managed external режиме дополнительно нужны planned row, успешный
`worker-launch-preflight`, process/status/presence records, result и terminal
resolution через runtime writer. Схемы writer соблюдаются без ручного обхода.

Fail: потерян handle, process остался бесконтрольным, результат непроверен или
managed запуск объявлен успешным при failed preflight. `spawn_agent` сам по
себе не является fail: это другой backend.

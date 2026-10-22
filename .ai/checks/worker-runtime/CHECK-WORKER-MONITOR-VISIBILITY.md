# Проверка: видимость запуска worker-а в monitor (`CHECK-WORKER-MONITOR-VISIBILITY`)

```yaml
check_id: CHECK-WORKER-MONITOR-VISIBILITY
title: Проверка видимости запуска worker/group в agent monitor
artifact_type: ai-runtime-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/worker-runtime/
related_rule: .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
  - .ai/workflows/core/worker-session/WORKFLOW.md
service_lifecycle_rule: .ai/rules/agent-runtime/RULE-AGENT-MONITOR-SERVICE-LIFECYCLE.md
runtime_store_contract: .ai/tools/agent-runtime/runtime/INDEX.md
runtime_tool: .ai/tools/agent-runtime
runtime_gateway: http://127.0.0.1:8765/
monitor_url: http://127.0.0.1:5173/
```

Применяется только в явно выбранном managed external режиме с project
monitor. Direct, native и обычный external режим: not_required.

До managed запуска выполни:

```bash
npm --prefix .ai/tools/agent-runtime run runtime -- worker-launch-preflight --session-id=<session-id> --json
```

Для настоящей managed группы добавь `--group-id=<group-id>`. Pass/fail берётся
из JSON команды; это проверка planned sessions, topology, presence и monitor
heartbeat выбранного режима. Не подменяй её успешным HTTP status.

При `pass=false` не запускай managed worker. Если monitor не был условием
задания, можно выбрать direct/native способ выполнения без synthetic state.
Lifecycle сервисов задаёт `RULE-AGENT-MONITOR-SERVICE-LIFECYCLE`; launch их
не перезапускает и не меняет host/port.

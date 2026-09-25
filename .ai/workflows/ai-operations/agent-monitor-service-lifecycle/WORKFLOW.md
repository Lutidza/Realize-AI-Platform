# Workflow: agent monitor service lifecycle (`agent_monitor_service_lifecycle_workflow`)

```yaml
artifact_id: agent-monitor-service-lifecycle-workflow
artifact_type: ai-workflow
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/ai-operations/agent-monitor-service-lifecycle/
related_rule: .ai/rules/agent-runtime/RULE-AGENT-MONITOR-SERVICE-LIFECYCLE.md
related_checks:
  - .ai/checks/agent-runtime/CHECK-AGENT-MONITOR-SERVICE-LIFECYCLE.md
  - .ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md
runtime_documentation: .ai/tools/agent-runtime/README.md
monitor_documentation: .ai/tools/agent-monitor/README.md
runtime_tool: .ai/tools/agent-runtime
```

## Назначение

Workflow задаёт operator lifecycle для runtime gateway и monitor UI. Все
детерминированные проверки выполняет `.ai/tools/agent-runtime`; workflow
только фиксирует порядок.

Применяй его при явной operator-задаче на сервисы или выборе managed external
runtime с project monitor. Для direct/native/обычного external режима результат
`not_required`: workflow не требует запусков, проверок портов или регистрации.

## States

```text
status_check
-> explicit_start_gate
-> worker_launch_preflight
-> handoff
```

## `status_check`

Выполнить:

```bash
npm --prefix .ai/tools/agent-runtime run runtime -- monitor-service-status --json
```

Pass только если status JSON подтверждает fixed URLs:

```text
gateway_url=http://127.0.0.1:8765/
monitor_url=http://127.0.0.1:5173/
gateway_health_route=/health
gateway_snapshot_route=/snapshot
```

Root `/` не является health gate.

## `explicit_start_gate`

Если operator явно просит запустить или переиспользовать services, выполнить:

```bash
npm --prefix .ai/tools/agent-runtime run runtime -- monitor-service-start --mode=preview --json
```

Обычная проектная работа использует monitor `preview`, не `dev`. Worker launch
не выполняет stop/restart, не меняет port и не использует fallback host/port.

## `worker_launch_preflight`

Перед managed `codex exec` выполнить:

```bash
npm --prefix .ai/tools/agent-runtime run runtime -- worker-launch-preflight --session-id=<session-id> --json
```

Только для настоящей managed группы добавь `--group-id=<group-id>`.
Preflight является gate этого managed запуска; Markdown check не заменяет JSON
результат. При `pass=false` сообщи blocker и не запускай managed worker.
Если monitor не был условием задания, можно выбрать direct/native выполнение
по активным правилам без synthetic state. Native handles не являются external
process records и не требуют этого preflight.

## `handoff`

В handoff указывать только:

```text
monitor_service_lifecycle_check: pass|fail|not_required
worker_launch_preflight: pass|fail|not_applicable
blocker: <short reason or none>
```

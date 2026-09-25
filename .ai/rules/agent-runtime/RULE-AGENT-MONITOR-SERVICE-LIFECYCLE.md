# Правило: lifecycle agent monitor service (`RULE-AGENT-MONITOR-SERVICE-LIFECYCLE`)

```yaml
artifact_id: RULE-AGENT-MONITOR-SERVICE-LIFECYCLE
artifact_type: ai-runtime-rule
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/agent-runtime/
workflow: .ai/workflows/ai-operations/agent-monitor-service-lifecycle/WORKFLOW.md
check: .ai/checks/agent-runtime/CHECK-AGENT-MONITOR-SERVICE-LIFECYCLE.md
related_rule: .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md
runtime_documentation: .ai/tools/agent-runtime/README.md
monitor_documentation: .ai/tools/agent-monitor/README.md
runtime_tool: .ai/tools/agent-runtime
monitor_tool: .ai/tools/agent-monitor
```

## Назначение

Lifecycle gateway/monitor сервисов проверяется через deterministic
`agent-runtime` команды. Markdown artifact фиксирует policy, а не повторяет
shell, curl или port-probe процедуру.

Правило применяется при явной operator-задаче на monitor/gateway или выборе
managed external runtime с project monitor. Для direct, native и обычного
external режима lifecycle monitor имеет результат `not_required`: эти режимы
не регистрируют synthetic sessions и не запускают сервисы.

## Требования

- Статус проверять командой:
  `npm --prefix .ai/tools/agent-runtime run runtime -- monitor-service-status --json`.
- Старт/переиспользование сервисов выполнять только по явной operator
  необходимости:
  `npm --prefix .ai/tools/agent-runtime run runtime -- monitor-service-start --mode=preview --json`.
- Обычный режим monitor для проектной работы: `preview`, не `dev`.
- Только managed worker launch перед `codex exec` обязан пройти:
  `npm --prefix .ai/tools/agent-runtime run runtime -- worker-launch-preflight --session-id=<session-id> --json`.
  Для настоящей managed группы добавь `--group-id=<group-id>`; group contracts
  берутся из текущего writer/preflight.
- Native collaboration разрешена по правилу координации; её handles не
  регистрируются как external processes в project runtime.
- Worker launch не стартует, не останавливает, не перезапускает gateway/monitor
  и не подбирает fallback port.
- Фиксированные URLs сервиса: `http://127.0.0.1:8765/` и
  `http://127.0.0.1:5173/`.

## Fail conditions

- status/preflight применимого managed/operator режима вернул `pass=false`;
- monitor запущен в normal work через dev mode;
- launch path пытается stop/restart/start services или сменить port;
- heartbeat URLs отличаются от фиксированных значений.

При ошибке managed launch не выполняется. Если monitor не был условием задания,
можно продолжить direct/native работу без synthetic state. Недоступность
необязательного monitor сама по себе не блокирует такой режим.

# Проверка: бюджет сообщений Dialog Assistant при worker-группах (`CHECK-WORKER-DIALOG-SURFACE-BUDGET`)

```yaml
check_id: CHECK-WORKER-DIALOG-SURFACE-BUDGET
artifact_type: ai-runtime-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/worker-runtime/
related_rules:
  - .ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md
  - .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
  - .ai/workflows/core/worker-session/WORKFLOW.md
runtime_store_contract: .ai/tools/agent-runtime/runtime/INDEX.md
monitor_tool: .ai/tools/agent-monitor/
```

Pass: пользователь получает содержательные короткие updates о ходе задачи,
существенных решениях и blockers, затем самостоятельный итог. Основной агент
объединяет worker results, а не копирует их целиком.

Fail: диалог перегружен повторяющимся polling, lifecycle записями, raw tool logs
или worker transcripts; итог отсутствует либо не показывает ограничений.
Secrets/private reasoning/ненужные PII не выводятся и не сохраняются.

Не требуется создавать runtime trace, счётчик сообщений или отдельный отчёт
ради этого check. Подробный artifact нужен только когда он полезен задаче.

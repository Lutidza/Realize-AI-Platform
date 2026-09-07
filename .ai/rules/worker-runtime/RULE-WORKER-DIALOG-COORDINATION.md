# Правило: Dialog Assistant как coordinator (`RULE-WORKER-DIALOG-COORDINATION`)

```yaml
artifact_id: RULE-WORKER-DIALOG-COORDINATION
artifact_type: ai-runtime-rule
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/worker-runtime/
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-PROFILE-REFERENCES.md
  - .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md
  - .ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-DIALOG-SURFACE-BUDGET.md
  - .ai/checks/worker-runtime/CHECK-WORKER-HANDOFF-READY.md
```

Работу выполняет основной агент напрямую или делегирует независимую подзадачу,
если это экономит время либо даёт полезную независимую проверку. Доступные
native collaboration tools разрешены; выбор внешнего `codex exec` сам по себе
не обязателен. Явное указание пользователя о способе работы имеет приоритет.

Основной агент может искать по репозиторию, реализовывать свою часть задачи,
координировать worker-ов и проверять итог. Отдельные search-worker и coordinator
нужны только при полезном разделении работы. Не создавай роли или стадии ради
заполнения схемы. Если обещан независимый review, его выполняет другой агент.

Каждый worker получает bounded assignment и возвращает результат назначившему
агенту. Основной агент отвечает за общий diff, проверки и ответ пользователю.
Существующее разрешение пользователя на задачу действует для делегирования и
последующих шагов внутри её scope; повторный approval не нужен.

Runtime store, monitor и bootstrap относятся только к явно выбранному внешнему
runtime workflow. Эти development-инструкции не меняют security/approval
контракты продуктового `services/ai-execution-worker/**`.

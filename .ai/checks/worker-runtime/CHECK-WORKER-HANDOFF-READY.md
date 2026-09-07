# Проверка: готовность handoff chain (`CHECK-WORKER-HANDOFF-READY`)

```yaml
check_id: CHECK-WORKER-HANDOFF-READY
artifact_type: ai-runtime-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/worker-runtime/
related_rules:
  - .ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md
  - .ai/rules/worker-runtime/RULE-WORKER-HANDOFF-CONTRACT.md
```

Pass: worker вернул назначившему агенту результат/changed paths, реальные
checks и существенные риски; основной агент проверил scope и итог. Если был
обещан независимый review, он завершён. Нужные tasks закончены, внешние
процессы завершены либо имеют явного владельца дальнейшей работы.

Fail: отсутствует требуемый результат, непроверенный diff выдан за принятый,
обязательная работа ещё выполняется без отражения этого факта или остаётся
бесконтрольный внешний процесс. Native idle/completed session не является
blocker. SQLite notification, отдельный coordinator и result file нужны лишь
при использовании runtime, которому они требуются.

Финальный пользовательский ответ даёт основной агент; runtime closure его
не заменяет. Достаточно краткого итога по `RULE-WORKER-HANDOFF-CONTRACT`.

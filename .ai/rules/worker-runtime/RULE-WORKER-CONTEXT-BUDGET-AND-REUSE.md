# Правило: контекст и переиспользование worker-сессии (`RULE-WORKER-CONTEXT-BUDGET-AND-REUSE`)

```yaml
artifact_id: RULE-WORKER-CONTEXT-BUDGET-AND-REUSE
artifact_type: ai-runtime-rule
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/worker-runtime/
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-CONTEXT-BUDGET-REUSE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-ASSIGNMENT-SCOPE.md
```

Продолжай существующую worker-сессию, если её контекст относится к задаче,
scope совместим и это сокращает повторное чтение. Новый агент полезен для
независимой параллельной подзадачи, независимого review или существенно другого
контекста. Поиск и реализация могут выполняться одним агентом.

Передавай цель, необходимые пути и ссылки на уже полученные факты. Не копируй
весь transcript и не заставляй повторно читать уже доступные инструкции.
Не вычисляй фиктивные remaining tokens, context estimates или запас в процентах:
используй метрики среды только когда они доступны и влияют на решение.

Worker не расширяет свой write scope ради reuse. При нехватке контекста верни
краткий handoff: результат, проверенные факты, открытый вопрос и следующий шаг.
Независимый reviewer не должен проверять собственную реализацию.

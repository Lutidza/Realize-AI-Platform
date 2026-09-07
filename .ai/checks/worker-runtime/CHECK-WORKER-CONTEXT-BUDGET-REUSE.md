# Проверка: context budget и reuse/spawn решение (`CHECK-WORKER-CONTEXT-BUDGET-REUSE`)

```yaml
check_id: CHECK-WORKER-CONTEXT-BUDGET-REUSE
artifact_type: ai-runtime-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/worker-runtime/
related_rule: .ai/rules/worker-runtime/RULE-WORKER-CONTEXT-BUDGET-AND-REUSE.md
```

Применяется при reuse существующего worker-а или существенной передаче контекста.

Pass: передан релевантный bounded контекст, scope совместим; reusable session
сокращает повторное чтение. Независимый reviewer отделён от автора реализации.

Fail: переполненный/нерелевантный transcript мешает задаче, передача контекста
расширяет write scope или собственный review выдан за независимый. Числовая
оценка token budget не нужна, когда среда не предоставляет таких метрик.

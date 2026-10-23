# Проверка: context budget и reuse/spawn решение (`CHECK-WORKER-CONTEXT-BUDGET-REUSE`)

```yaml
check_id: CHECK-WORKER-CONTEXT-BUDGET-REUSE
artifact_type: ai-runtime-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/worker-runtime/
related_rule: .ai/rules/worker-runtime/RULE-WORKER-CONTEXT-BUDGET-AND-REUSE.md
```

Применяется при reuse существующего worker-а, существенной передаче контекста
или ожидании асинхронного процесса основным агентом/worker-ом.

Pass: передан релевантный bounded контекст, scope совместим; reusable session
сокращает повторное чтение. Независимый reviewer отделён от автора реализации.

При ожидании используется событие завершения либо тот же handle с интервалом
по связанному правилу; нет дублирующего наблюдателя и повторных запусков команды.
Короткое ожидание обосновано интерактивностью, отменой или ограничением среды.

Fail: переполненный/нерелевантный transcript мешает задаче, передача контекста
расширяет write scope или собственный review выдан за независимый. Числовая
оценка token budget не нужна, когда среда не предоставляет таких метрик.
Цикл коротких пустых опросов без такой причины — fail, даже если каждый ответ
маленький. Отдельный trace или счётчик ради этой проверки не создаётся.

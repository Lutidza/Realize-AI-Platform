# Проверка: assignment scope и manifest целостность (`CHECK-WORKER-ASSIGNMENT-SCOPE`)

```yaml
check_id: CHECK-WORKER-ASSIGNMENT-SCOPE
artifact_type: ai-runtime-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/worker-runtime/
related_rule: .ai/rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md
```

Применяется к каждому assignment; отдельный report не нужен.

Pass: понятны миссия, owner, разрешённые пути, write mode, результат и проверки;
планируемая запись не затрагивает запрещённые пути или чужой diff. Документация
допустима в scope документационной задачи. Удаление соответствует запросу и
проверено на потерю нужных данных/ссылок.

Fail: worker расширяет assignment сам, пишет в read-only режиме, нарушает
ограничения пользователя либо одновременно конфликтует с другой записью.
Полный manifest проверяй только если его требует выбранный runtime.

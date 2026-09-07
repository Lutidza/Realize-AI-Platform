# Правило: запрет scope expansion без решения (`RULE-WORKER-NO-SCOPE-EXPANSION`)

```yaml
artifact_id: RULE-WORKER-NO-SCOPE-EXPANSION
artifact_type: ai-runtime-rule
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/worker-runtime/
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
related_rules:
  - .ai/rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md
checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-ASSIGNMENT-SCOPE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-CONTEXT-BUDGET-REUSE.md
```

Worker выполняет только полученный assignment. Если правильный owner выходит
за разрешённые пути, верни назначившему агенту нужный path и причину; продолжай
независимую работу внутри scope.

Основной агент может уточнять assignment и пути внутри уже авторизованной
задачи без повторного вопроса пользователю. Новый продуктовый scope, внешнее
действие или необратимый шаг требуют отдельного решения только когда текущего
разрешения недостаточно.

Не изменяй чужой diff, не объединяй несовместимые allowlists и не превращай
read-only assignment в запись. Удаление устаревшего файла внутри согласованной
оптимизации допустимо с проверкой ссылок и disposition; standalone approval
для каждого такого файла не требуется.

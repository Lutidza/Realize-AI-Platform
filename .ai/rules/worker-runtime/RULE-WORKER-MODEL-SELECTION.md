# Правило: selection модели worker-а (`RULE-WORKER-MODEL-SELECTION`)

```yaml
artifact_id: RULE-WORKER-MODEL-SELECTION
artifact_type: ai-runtime-rule
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/worker-runtime/
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-MODEL-SELECTION.md
```

По умолчанию используй модель, унаследованную от текущей среды или задания.
Не передавай override, если он не нужен. Если выбор требуется, учитывай
сложность, риск и реально доступные модели в текущих tool/config capabilities.
Конкретные model IDs не фиксируются в проектном правиле.

Соблюдай явный выбор пользователя и ограничения среды на overrides. При
разрешённом выборе модели дополнительный approval не нужен. Если явно
запрошенная модель недоступна, сообщи это; замену выбирай только в пределах
уже разрешённого пользователем fallback. Неподдерживаемый ID не выдумывай.

Не добавляй model gate для каждой стадии и не запрашивай availability повторно
при обычном наследовании. Причину override укажи одной строкой, если она важна
для стоимости или качества результата.

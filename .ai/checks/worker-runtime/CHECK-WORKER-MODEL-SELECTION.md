# Проверка: model selection для worker assignment (`CHECK-WORKER-MODEL-SELECTION`)

```yaml
check_id: CHECK-WORKER-MODEL-SELECTION
artifact_type: ai-runtime-check
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/worker-runtime/
related_rule: .ai/rules/worker-runtime/RULE-WORKER-MODEL-SELECTION.md
```

Применяется при явном model override. Обычное наследование модели проходит
без отдельной матрицы, availability probe и report.

Pass: override разрешён средой, ID реально доступен и соблюдён выбор
пользователя. Существенный fallback имеет короткое объяснение.

Fail: неподдерживаемый ID, запрещённый override или несогласованная замена
явно требуемой модели. Проект не закрепляет конкретное поколение моделей.

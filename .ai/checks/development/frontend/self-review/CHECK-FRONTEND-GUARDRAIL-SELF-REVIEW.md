# Check: frontend guardrail self-review

```yaml
check_id: CHECK-FRONTEND-GUARDRAIL-SELF-REVIEW
owner_layer: .ai/checks/development/frontend/self-review/
applies_to:
  - frontend implementation diff
related_rules:
  - .ai/rules/development/frontend/RULE-NEXT-REACT-FRONTEND-BOUNDARIES.md
  - .ai/rules/development/frontend/RULE-REUSE-BEFORE-LOCAL-IMPLEMENTATION.md
  - .ai/rules/development/frontend/RULE-NO-LOCAL-VISUAL-CONTRACT.md
  - .ai/rules/development/frontend/RULE-NO-RELATED-UI-DRIFT.md
report: shared_task_result
```

## Условия прохождения

- Использован фактический UI owner; Server/Client boundary и DTO/data ownership
  сохранены, затронутые shared consumers учтены.
- Проверки выбраны по риску из
  `.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md`.
- Rendered DOM/CSS, формы, focus, interactions и responsive behavior подтверждены
  в браузере на затронутом сценарии. При недоступной среде причина и конкретное
  непроверенное поведение указаны явно.
- Screenshot comparison выполнен, если результат оценивается по reference.

Чистые docs/comments/type-only изменения не требуют браузера. Для локальной
UI правки достаточно соответствующего сценария; full e2e suite и build не
следуют автоматически из факта изменения frontend файла. Итог объединяется
с общим review; неприменимые поля не заполняй.

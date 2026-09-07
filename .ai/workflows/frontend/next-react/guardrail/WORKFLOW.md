# Workflow: Next/React frontend guardrail

```yaml
workflow_id: frontend-next-react-guardrail
owner_layer: .ai/workflows/frontend/next-react/guardrail/
applies_to:
  - src/app/(app)/**
  - src/components/**
  - src/providers/**
  - packages/payload-ai-plugin/**
related_role:
  - .ai/roles/developer/frontend/INDEX.md
related_rules:
  - .ai/rules/development/frontend/RULE-NEXT-REACT-FRONTEND-BOUNDARIES.md
  - .ai/rules/development/frontend/RULE-REUSE-BEFORE-LOCAL-IMPLEMENTATION.md
  - .ai/rules/development/frontend/RULE-REFERENCE-PATTERN-SCAN-BEFORE-IMPLEMENTATION.md
  - .ai/rules/development/frontend/RULE-NO-LOCAL-VISUAL-CONTRACT.md
  - .ai/rules/development/frontend/RULE-NO-RELATED-UI-DRIFT.md
```

1. Определи affected route/component и ожидаемое поведение.
2. Найди существующий owner/pattern в `src/app/(app)/**`, `src/components/**`,
   `src/providers/**`, `src/utilities/**` или package UI. Проверь ближайшие
   consumers общего компонента; весь frontend аудит не нужен.
3. Проверь затронутую Server/Client и data/API границу. Backend contract имеет
   своего owner; роль UI сама по себе не разрешает скрыто менять API/schema.
4. До записи зафиксируй scope и минимальное достаточное evidence. Reference
   сравни до реализации, если он дан. Browser нужен для выводов о rendering,
   CSS/responsive, interaction или visual parity.
5. Внеси изменение, проверь diff и требуемое поведение. Общий guardrail report
   или отдельный reviewer нужны только по scope задачи/риску.

Уточняй scope внутри пользовательского запроса без повторной приёмки каждого
компонента. Не добавляй UI dependency без проверки текущего стека и разрешения
на такое расширение. Недоступное обязательное browser evidence укажи как
ограничение, не объявляй визуальную проверку успешной по одному lint.

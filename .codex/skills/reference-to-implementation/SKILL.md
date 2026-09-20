---
name: reference-to-implementation
description: >-
  Используй, когда задачу нужно привести к reference, screenshot, raw HTML,
  existing page или design example. Требует literal comparison before code.
---

# От референса к реализации

Skill применяется для сравнения reference с текущей реализацией, включая
Next.js routes, React components, Tailwind/shadcn UI, theme and browser
behavior.

Подробный маршрут от брифа и проверенных источников до интерактивной вёрстки,
проверки и передачи исполнителю находится в разделе
[«От референса к интерфейсу»](../../../.ai/workflows/frontend/next-react/guardrail/WORKFLOW.md#reference-to-frontend).
Он также описывает границы админского агента и Code Lane. Используй его вместе
с краткими шагами ниже; этот skill не вводит отдельный workflow или новые права.

## Что открыть

- reference artifact из задачи;
- `documentation/project-context.md`;
- `.ai/roles/developer/frontend/INDEX.md`, если task is frontend;
- `.ai/rules/development/frontend/RULE-REFERENCE-PATTERN-SCAN-BEFORE-IMPLEMENTATION.md`;
- `.codex/skills/frontend-runtime-evidence/SKILL.md`, если нужен browser or
  screenshot evidence.

## Порядок

1. Определи exact reference source.
2. Найди существующие аналоги в `src/app/(app)/**`, `src/components/**`,
   `src/providers/**` и `src/utilities/**`; для Payload Admin — в
   `packages/payload-ai-plugin/**`. Уточняй владельца по контексту проекта.
3. Составь mismatch map: composition, markup, spacing, typography, colors,
   state, behavior, responsive differences.
4. Выбери owner for each mismatch: route/page/layout, shared component, theme,
   client behavior, route helper or backend data shape.
5. Выполняй правки по одному coherent layer.
6. Перепроверь result against reference or document blocker.

При передаче в Code Lane применяй шаги 5 и 7 указанного workflow: ссылки на
прочитанные файлы оставляй в исследовании, а в итоговом плане перечисляй точные
пути реальных правок. Сверяй derived scope и зарегистрированные проверки.
Обязательные `secrets`, `lint`, `typecheck`, `test:int`, `build` не заменяются
адресными UI-проверками; существующий npm script не обязательно разрешён
серверным реестром. Новые команды или scripts ради оформления плана не вводи.

Сохраняй в самодостаточном плане проверенные публичные URL изображений, alt и
их визуальное назначение. Они не являются путями исходников для чтения.
Передачу изображений от host описывай точным props-контрактом; не оставляй
исполнителю неопределённое «host передаст» или неподтверждённые заглушки.

При сохранении образца или материалов сравнения применяй
[правило материалов задачи](../../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md).

## Жёсткие правила

- Не импровизируй UI при наличии reference.
- Не меняй unrelated surfaces outside allowlist.
- Не переносить в project чужой frontend stack ради reference parity.
- Не объявлять screenshot parity без browser/screenshot evidence or skip reason.

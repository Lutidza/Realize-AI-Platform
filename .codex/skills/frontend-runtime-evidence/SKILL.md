---
name: frontend-runtime-evidence
description: >-
  Выбирает достаточную проверку Next/React UI: browser для DOM/CSS, форм,
  focus и responsive поведения, screenshot для visual/reference comparison.
---

# Проверка frontend поведения

Используй матрицу `.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md`
и фактический owner из `documentation/project-context.md`. Уже прочитанные
правила и контекст повторно не загружай.

1. Назови затронутый route/component, observable scenario и критерий успеха.
   Для responsive изменений выбери нужные viewport, для форм — изменённые states.
2. Выбери проверку по матрице. Static/typecheck/build/browser не являются
   последовательностью обязательных tier. Воспроизведи дефект до правки,
   если это помогает проверить исправление.
3. После изменения собери evidence выбранного сценария: rendered DOM/computed CSS,
   ввод/focus или screenshot comparison — по предмету задачи. Повторный full e2e
   suite или build не следуют автоматически из изменения frontend файла.

Если route/DB/dev server недоступны, выполни независимые проверки, сообщи
точную причину и непроверенное поведение. Static review и причина пропуска не
считаются подтверждением browser результата. Не добавляй постоянные тесты для
обратимой малорисковой визуальной правки; сохраняй regression test, когда он
защищает существенное поведение.

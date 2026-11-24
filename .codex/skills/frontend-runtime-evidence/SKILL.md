---
name: frontend-runtime-evidence
description: >-
  Выбирает достаточную проверку Next/React UI: browser для DOM/CSS, форм,
  focus и responsive поведения, screenshot для visual/reference comparison.
---

# Проверка frontend поведения

Выбирай проверки по
[маршрутизации DoD](../../../.ai/workflows/core/main-delivery/WORKFLOW.md#маршрутизация-dod-dod_routing).
Фактического owner уточняй в относящемся к задаче разделе
`documentation/project-context.md`. Уже доступные актуальные тексты используй
без повторной загрузки; из длинного workflow или контекста читай только
недостающий раздел.

1. Назови затронутый route/component, observable scenario и критерий успеха.
   Для responsive изменений выбери нужные viewport, для форм — изменённые states.
2. Выбери проверку по изменению и риску. Static/typecheck/build/browser не являются
   последовательностью обязательных tier. Воспроизведи дефект до правки,
   если это помогает проверить исправление.
3. После изменения собери evidence выбранного сценария: rendered DOM/computed CSS,
   ввод/focus или screenshot comparison — по предмету задачи. Повторный full e2e
   suite или build не следуют автоматически из изменения frontend файла.

Если сохраняешь материалы проверки, применяй
[правило материалов задачи](../../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md).
До записи выбери `.ai-workspace/tasks/<task-id>/` и создай нужный подкаталог.
В `filename`, `filePath` или `path` передавай абсолютный путь внутри него.
Одного `output-dir` Playwright недостаточно при явном `filename`.
После записи проверь фактический путь и наличие файла.

Если route/DB/dev server недоступны, выполни независимые проверки, сообщи
точную причину и непроверенное поведение. Static review и причина пропуска не
считаются подтверждением browser результата. Не добавляй постоянные тесты для
обратимой малорисковой визуальной правки; сохраняй regression test, когда он
защищает существенное поведение.

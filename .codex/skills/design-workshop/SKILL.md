---
name: design-workshop
description: >-
  Проектирует и развивает референсы, интерактивные макеты, компоненты и темы
  Admin/frontend в Мастерской Realize; связывает бриф, дизайн-систему, версии
  и проверку при работе из Admin, ChatGPT и IDE. Не нужен для одиночного CSS-исправления.
---

# Мастерская дизайна Realize

Используй [роль Workshop Director](../../../.ai/roles/design/workshop-director/INDEX.md)
и [workflow Мастерской](../../../.ai/workflows/frontend/design-workshop/WORKFLOW.md).
Это канонические инструкции; skill — адаптер, а не новая система полномочий.

Сначала определи тип результата, target и реальные инструменты текущего канала.
Учитывай уже принятые решения и разрешения пользователя. Для референса,
компонентов и тем используй существующие UI owners, а не параллельную библиотеку.

Открывай материалы по этапу:

- Бриф/передача: поля в workflow; при локальном доступе — дополнительный
  [шаблон](../../../.ai/templates/design/TEMPLATE-DESIGN-WORKSHOP-BRIEF.md),
  который текущий S1 не доставляет.
- Исследование/реализация UI: [reference workflow](../../../.ai/workflows/frontend/next-react/guardrail/WORKFLOW.md#reference-to-frontend)
  и [reference-to-implementation](../reference-to-implementation/SKILL.md).
- Проверка: [review rubric](../../../.ai/checks/development/frontend/CHECK-DESIGN-WORKSHOP-REVIEW.md)
  и [frontend-runtime-evidence](../frontend-runtime-evidence/SKILL.md), если изменяется UI.
- Продуктовая архитектура, будущий pipeline и каналы:
  [спецификация](../../../documentation/specifications/design-workshop.md).

Пример применения: «Доработай референс Task Manager по замечаниям», «Создай тему
админки и витрины», «Подготовь компонент с состояниями и передай его в другой чат».
При точном готовом референсе сравни его до кода. При новом дизайне сохрани
обоснованное направление и проверяемые критерии, соразмерные задаче.

В MCP-среде сначала проверь capabilities и hash-версию инструкций через S1.
Используй `workshop_*` только из фактического каталога и по циклу
read/prepare/review/apply/preview в workflow. Если записи нет,
подготовь точный результат для передачи и обозначь неприменённые изменения.
Не запускай Codex автоматически для правок, которые пользователь хочет
подготовить силами GPT. Итог различает исследование, подготовленный patch,
реальную запись, проверку и доставку.

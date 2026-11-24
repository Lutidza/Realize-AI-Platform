---
name: frontend-guardrail-audit
description: >-
  Используй для отдельного read-only аудита frontend-долга Realize — AI Platform:
  duplicated React UI, hidden local visual contracts, route/component drift,
  client boundary issues and missing browser evidence.
---

# Аудит frontend guardrail

## Ограниченное пакетное чтение

До чтения сверь уже полученные актуальные тексты и диапазоны. Для недостающих
источников вызывай существующий readonly reader из корня проекта:

```bash
node .ai/tools/context-reading/read-context.mjs '[{"path":"...","startLine":1,"endLine":null}]'
```

Подставь выбранные пути и границы строк с 1; `endLine: null` означает до EOF.
Для известных разделов вместо номеров передавай `section` с точным Markdown
заголовком или `beforeHeading` для текста перед ним. Это исключает угадывание
координат; возвращённый `pending` всегда содержит точные диапазоны строк.
Один вызов принимает до 3 независимых источников или непересекающихся диапазонов
и возвращает до 3 фрагментов. Текст читай только из `sources`; все диапазоны
`pending` передай следующим вызовом без повторов, пока остаток не исчерпан.
Весь JSON с `pending` и переводом строки ограничен 12 288 байт UTF-8.
Вызывай reader отдельной командой, без дополнительного stdout после JSON;
служебные команды группируй отдельно. Для ответа чтения назначь
`max_output_tokens: 8000`; при более строгом лимите выбери меньшие диапазоны
и `--max-bytes N` (положительное N не больше 12288). Не заменяй reader
собственным inline-кодом, `head` или обрезкой вывода.

Это не отменяет вход по `AGENTS.md`: при первом знакомстве полностью прочитай
`README.md` и `.ai/README.md`, затем global registry и применимые rules/checks.
Metadata и начальный фрагмент не заменяют обязательный текст; уже полученное
актуальное не перечитывай. По триггерам global registry любой такой shell-анализ
требует текстов:

- `.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md`;
- `.ai/rules/global/RULE-SAFE-COMMAND-PROPOSAL.md`;
- `.ai/checks/pre-implementation/CHECK-SAFE-COMMAND-PROPOSAL.md`.

Это адресный пакет перед профильным чтением, если этих текстов ещё нет.
Если нужен поиск по репозиторию, включая `rg` заголовков для навигации, до поиска
прочитай `.ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md` и
`.ai/checks/pre-implementation/CHECK-SEARCH-SCOPE-DISCIPLINE.md` полностью пакетами.
Проверяй не только пустой `pending`, но и отсутствие невыбранных обязательных
источников. Общая процедура — в [каталоге skills](../README.md).

Используй skill только для read-only аудита. Product code не меняется без
отдельного pre-edit gate.

## Источники аудита

1. `documentation/project-context.md` — разделы о проверяемом frontend-владельце.
2. `.ai/roles/developer/frontend/INDEX.md`
3. `.ai/workflows/frontend/next-react/guardrail/WORKFLOW.md` — для статического
   аудита без референса только общий порядок до «От референса к интерфейсу»;
   из reference-процесса нужные шаги только при соответствующем сценарии,
   без загрузки полного workflow. Вычисли конец диапазона как номер строки перед
   `## От референса к интерфейсу`; произвольные первые 80/100 строк захватывают
   лишние стадии и не соответствуют этому маршруту.
   Для извлечения используй reader selection с `path` этого workflow и
   `beforeHeading: "## От референса к интерфейсу"`; отдельный поиск известного
   заголовка и угадывание конца диапазона не нужны.
4. `.ai/registry/rules/development/frontend/INDEX.md` — применимые записи.
5. `.ai/templates/agent-reports/TEMPLATE-FRONTEND-GUARDRAIL-AUDIT.md`
6. `.ai/checks/self-review/CHECK-FRONTEND-GUARDRAIL-AUDIT-REPORT.md`

## Рабочий порядок

1. Зафиксируй audit scope and read-only mode.
2. Найди affected route/page/component/style owners.
3. Проверь duplicates and drift через `rg`.
4. Для каждого finding укажи файл, evidence, violated rule/check, correct
   owner-layer and next step.
5. Не расширяй scope за пределы audit request.

При сохранении отчёта или доказательств применяй
[правило материалов задачи](../../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md).

## Ограничения

- Не редактируй product code in audit mode.
- Не создавай new rules/checks inside audit step.
- Не применяй assumptions from another stack к текущему frontend contour.

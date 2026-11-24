---
name: git-commit-push
description: >-
  Выполняет inspect через программный адаптер без модели; остальные Git-операции
  передаёт отдельному воркеру: manage, commit, fetch, pull, push и GitHub merge.
  Используй для Git рабочего слоя.
---

# Git через разрешённый адаптер

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

## Выбор действия

Для `inspect` используй маршрут ниже. Только для `commit`, `push`, `manage`,
`fetch`, `pull` или `merge` прочитай
[процедуру модельных Git-действий](references/worker-actions.md) до запуска.
Она содержит рабочий контекст, проверки, подключение, профили и восстановление
этих действий; для обычного `inspect` не подключай её и её источники.

## Программный inspect

Используй актуальные тексты разделов
[«Программный inspect»](../../../.ai/workflows/delivery/git/commit-push/WORKFLOW.md#программный-inspect)
и [«Исполнитель и разрешение»](../../../.ai/rules/git/RULE-GIT-DELIVERY.md#исполнитель-и-разрешение)
с его подразделами. Если их ещё нет в контексте, получи только эти разделы:

```bash
node .ai/tools/context-reading/read-context.mjs '[{"path":".ai/workflows/delivery/git/commit-push/WORKFLOW.md","section":"## Программный inspect"},{"path":".ai/rules/git/RULE-GIT-DELIVERY.md","section":"## Исполнитель и разрешение"}]'
```

Дочитай весь `pending`. Не загружай смешанный «Порядок выполнения», подготовку
verification/delivery и источники других действий. Ссылки не требуют повторного
чтения уже полученных актуальных текстов.

Команды проекта запускай из корня обычным `npm` в закреплённой паре Node/npm по
[правилу runtime](../../../.ai/rules/development/RULE-DEPENDENCY-VERSION-EVIDENCE-BEFORE-INSTALL.md#единый-runtime-проекта).
Используй актуальное успешное evidence `verify:runtime` для той же среды;
если его нет или runtime изменился, выполни `npm run verify:runtime`.
При несовпадении исправь окружение запуска и открой новую сессию; отказ
не разрешает обход guard.

Для обычного `inspect` выполни `npm run --silent git:worker -- inspect`.
Если в этом вызове нужна свежая проверка runtime, вместо отдельного запуска
допустима группа `npm run verify:runtime && npm run --silent git:worker -- inspect`
одним command call: при отказе проверки `inspect` не запустится. Если актуальное
evidence уже есть, выполняй только `inspect`; оба варианта запускают его один раз.
Это отдельный программный адаптер без модели через
`validateGitWorkerContext` → `deliverGitWorkerCommand` → `runDelivery` →
`@realize/git-runtime`. Codex CLI, App Server, профиль, prompt и
`REALIZE_GIT_CODEX_HOME` не нужны. Сохраняются проверки typed-команды,
root/scope/inputPaths, read-only права, блокировка репозитория, ограниченная
сводка и fingerprint. Для ответа адаптера назначь `max_output_tokens: 16000`,
если среда поддерживает этот лимит; не повторяй `inspect` ради усечённой сводки.

При достаточном read-only маршруте и известном runtime обычный `inspect`
не требует чтения документов workspace/runtime или README обработчика.
Если действительно назначены scope или `verification.inputPaths`, открой
конкретный [контракт локального контекста](../../../.ai/tools/git-delivery/README.md#прямой-локальный-вход)
и передай доверенный `REALIZE_GIT_CONTEXT_FILE` с этими параметрами.
Основной агент сохраняет разрешённый вход `git:worker`; пример внутреннего
исполнителя в README не разрешает прямой вызов.

## Ожидание и результат

Запущенную Git-команду или проверку ожидай по
[общему правилу](../../../.ai/rules/worker-runtime/RULE-WORKER-CONTEXT-BUDGET-AND-REUSE.md#ожидание-процессов-и-воркеров).
Для пустого `write_stdin` задавай `yield_time_ms: 30000` или больше в пределах
среды; не используй повторяющийся `yield_time_ms: 1000` ради статуса процесса.
При `functions.exec` назначай его `yield_time_ms` не меньше внутреннего ожидания
с небольшим запасом в пределах среды. Возвращённый cell ID продолжай через
`functions.wait`; это не основание для второго Git-запуска или status-команды.

Получи фактический результат адаптера и передай существенный результат пользователю.
Запуск возвращает фактический `result`, эффективную `command` и сведения об исполнении.
Успех требует `status: succeeded`; наличие текста модели его не доказывает.
Порядок Git-команд принадлежит обработчику, ограничения — связанному правилу.

`inspect` требует разрешённого анализа и не разрешает последующую запись.
Завершение правки не разрешает commit/push или другое внешнее действие.
Общий `@realize/git-runtime` и MCP machine read port не заменяют development
`inspect` и не разрешают основному агенту прямой Git или произвольный shared executor.

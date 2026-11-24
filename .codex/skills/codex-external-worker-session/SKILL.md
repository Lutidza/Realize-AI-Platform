---
name: codex-external-worker-session
description: >-
  Используй при запуске или ведении внешнего Codex worker через codex exec:
  bounded assignment, реальный process handle, ожидание результата, проверка
  изменений и завершение процесса; managed runtime подключается отдельно.
---

# Внешняя Codex worker-сессия

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

Применяется только к внешнему `codex exec`. Direct/native работа следует
[правилу координации](../../../.ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md)
и не требует этого skill, bootstrap, SQLite или project monitor.

Этот skill — процедурный адаптер; источники требований:

- [назначение worker-а](../../../.ai/workflows/core/worker-assignment/WORKFLOW.md);
- [lifecycle](../../../.ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md)
  и [порядок сессии](../../../.ai/workflows/core/worker-session/WORKFLOW.md);
- [выбор модели](../../../.ai/rules/worker-runtime/RULE-WORKER-MODEL-SELECTION.md);
- [runtime bridge check](../../../.ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md)
  и [проверка перед handoff](../../../.ai/checks/self-review/CHECK-WORKER-SESSION-LIFECYCLE-BEFORE-HANDOFF.md).

Используй уже прочитанные актуальные требования. Ссылки помогают выбрать
нужный источник, а не требуют загрузить весь граф; правило выбора модели
открывай при выборе override, managed-источники — только для этого режима.
Для ordinary external в worker-session workflow выбери разделы
[«Выбор режима»](../../../.ai/workflows/core/worker-session/WORKFLOW.md#выбор-режима)
и [«Общая последовательность»](../../../.ai/workflows/core/worker-session/WORKFLOW.md#общая-последовательность),
сохраняя требования общего lifecycle и обычного external bridge check.
Извлекай эти два раздела точными selectors, без диапазона `1..100` и без чтения
managed-дополнения или отдельного поиска известных заголовков:

```bash
node .ai/tools/context-reading/read-context.mjs '[{"path":".ai/workflows/core/worker-session/WORKFLOW.md","section":"## Выбор режима"},{"path":".ai/workflows/core/worker-session/WORKFLOW.md","section":"## Общая последовательность"}]'
```

Дочитай весь `pending` выбранных разделов перед выводом.

## Процедура

1. Подтверди по текущему заданию необходимость внешнего worker-а. Основной агент
   может выполнять свою часть напрямую и сам принимать результат; отдельный
   coordinator или search-worker нужен только по полезному разделению работы.
2. Передай bounded assignment: цель, источник и owner, cwd/worktree, allowed и
   forbidden paths, write mode, checks, результат и адресат, stop condition.
   Уточни способ получения output и остановки процесса до запуска.
3. Наследуй модель текущей среды/задания. Override допустим только по правилу
   выбора модели и ограничениям среды; используй реально доступный ID.
   Follow-up внутри уже разрешённого scope не требует отдельного autonomous grant.
4. Выбери обычный external либо явно managed external режим. Для обычного
   режима registry, monitor и runtime maintenance не нужны. Для managed выполни
   дополнение ниже до запуска.
5. Запусти `codex exec` в разрешённом cwd, сохрани настоящий process/session
   handle. Не выдавай runtime row или выдуманный handle за запущенный процесс.
6. Дождись exit status и результата по
   [общему правилу ожидания](../../../.ai/rules/worker-runtime/RULE-WORKER-CONTEXT-BUDGET-AND-REUSE.md#ожидание-процессов-и-воркеров):
   событие завершения либо длительное ожидание того же handle. Для доступного
   `write_stdin` запрашивай `yield_time_ms: 30000` или больше в пределах среды,
   без короткого пустого polling и дублирующего monitor. При ошибке, отмене или blocker останови
   свой процесс доступным средством среды либо передай явному владельцу с
   причиной и следующим шагом. Не оставляй процесс бесконтрольно работать.
7. Проверь изменённые файлы, разрешённую область и требуемые checks. Git evidence
   получай только установленным Git-маршрутом проекта. Worker возвращает
   результат назначившему агенту; дополнительная цепочка ролей не обязательна.
8. Прими результат или выдай bounded follow-up. Выполни lifecycle check для
   реально запущенных worker-ов и сообщи пользователю итог, проверки, оставшиеся
   ограничения. В общий ответ не копируй полные логи и worker transcripts.

## Продолжение внешней сессии

Для совместимого follow-up используй `exec resume <точный UUID> -` с исходными
cwd, model/config и approval/sandbox. UUID бери из результата своего запуска,
а не из `--last`; после запуска сверь фактический thread/session ID. Сохраняй
bounded assignment, handles и lifecycle; прежний результат не заменяет новое
чтение изменяемого состояния. Недоставленные или изменившиеся инструкции дочитай.
Если нужный skill уже применён и его полный текст актуален в истории, передай
короткий follow-up без повторного `$skill`: в проверенном Codex CLI `0.162.1`
явный вызов заново вставляет его текст.
Новая задача или другой scope требуют отдельного решения о совместимости;
resume не расширяет разрешения и не гарантирует cache hit.

## Optional managed external runtime

Это дополнение применяется только при явном выборе project `agent-runtime`.
Контракт и команды: [runtime README](../../../.ai/tools/agent-runtime/README.md),
[managed-раздел worker-session workflow](../../../.ai/workflows/core/worker-session/WORKFLOW.md#дополнение-для-optional-managed-external-runtime),
[monitor visibility check](../../../.ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md).

- До запуска создай управляющую `dialog-assistant`, planned worker session и
  presence через writer. Поля assignment бери из текущей schema.
- Только для настоящей managed группы создай group/member/edge topology.
  Сохрани ограничения её preflight: отдельный coordinator, group closer,
  returns-to и acceptance. Не переноси их на native или обычный external режим.
- Выполни `worker-launch-preflight --session-id=<session-id> --json` через
  `npm --prefix .ai/tools/agent-runtime run runtime --`. `--group-id` нужен
  только для настоящей managed группы. Gate принимает JSON `pass`, а не
  отдельный HTTP status. При ошибке managed launch останавливается.
- Monitor/gateway переиспользуются; запуск worker-а не запускает и не
  перезапускает сервисы и не меняет порты. Если monitor не был условием задания,
  можно продолжить direct/native способом по активным правилам без synthetic state.
- После фактического запуска сохрани process record/handle через writer,
  затем `running`/`working`. Writer описывает состояние, а не заменяет executor.
  `operator-command-dispatch stop` сохраняет stop request; его успешная запись
  не доказывает остановку внешнего процесса.
- По результату запиши `result-ready`/`needs-review`, `idle` и delivery evidence
  от реального worker-а. Для delivery notification `actor-session-id` совпадает
  с `source-session-id`. Job/stage peer messages передают явные `message-type`,
  `correlation-id`, `requires-ack` и `payload-json` с `job_id`; receiving worker
  фиксирует ack. Сообщение не меняет lifecycle чужой session.
- После приёмки запиши terminal resolution, `closed` и `offline`. Оставляя
  незавершённую session, используй предусмотренный schema continuation,
  reassignment, blocker или согласованный deferral contract с владельцем.
  Разреши blocking notifications/messages текущей задачи и заверши собственную
  managed coordination session перед final handoff.
- SQLite, projection и JSONL export не редактируются вручную. Maintenance
  применяй по [его workflow](../../../.ai/workflows/ai-operations/agent-runtime-maintenance/WORKFLOW.md),
  только когда он требуется текущей работой с runtime store. Наличие worker-а
  не запускает глобальное обслуживание runtime.

Trace создавай только по необходимости, через разрешённый writer/artifact.
Не сохраняй private reasoning, secrets, production dumps и лишние PII.
Ни skill, ни managed runtime не расширяют разрешения на Git, deploy, credentials
или изменение продуктовых approval/security lanes.

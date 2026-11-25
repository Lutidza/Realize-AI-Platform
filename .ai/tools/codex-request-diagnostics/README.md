# Hash-only диагностика запросов Codex

Отдельный диагностический инструмент для native Codex CLI.
Программный `git:worker -- inspect` не вызывает модель; инструмент наблюдает
вызывающий Codex. Обычный inspect не требует relay или дополнительной сессии.

## Граница наблюдения

Authenticated HTTP CONNECT relay слушает только `127.0.0.1` на временном порту.
Назначения закрыты: `chatgpt.com:443` и `api.openai.com:443`. Исходные provider URL,
Host/SNI, cookies, cache key, инструкции и порядок запросов не меняются.
Relay проверяет сертификат настоящего upstream и согласует одинаковый ALPN
на обеих TLS-сессиях. Application bytes копируются duplex с backpressure;
parser получает отдельную копию. HTTP/WS сообщения не перепаковываются.
Бюджеты раздельны: до 64 одновременно активных sockets и до 128 CONNECT за
запуск relay. Превышение остаётся coverage error; увеличение lifetime-бюджета
не переоценивает старые failed cohorts и не отключает TLS/framing guards.

Upstream TLS получает общий deadline 15 секунд и не более двух dials на CONNECT.
Единственный повтор с backoff 100 ms допустим только до успешной передачи socket
в downstream TLS, когда application bytes ещё не пересылались: для exact closed
классов reset/timeout/temporary DNS/refused/unreachable/remote internal alert/early EOF.
Certificate, ALPN, неизвестные ошибки и AggregateError не получают retry. После
upstream handoff повторов нет. Отмена очищает pending timer/socket; тихий upstream
close до downstream handshake немедленно закрывает клиента. Это исправляет
воспроизведённый lifecycle hazard, но не устанавливает историческую причину A3
CONNECT 50/51: прежний отчёт не сохранил error class и остаётся failed.

Начиная со схемы `8` каждый TLS attempt имеет закрытые stage/outcome/errorClass, ordinal
`1|2` и `applicationForwarded: false`; messages, stacks, addresses и certificates
не сохраняются. Восстановленный pre-application сбой виден как `retrying`, затем
`connected`; исчерпание/неретрайный сбой остаётся coverage error с typed details.
Повторы TLS не являются повторами model requests: body не replay-ится. Точные
счётчики CONNECT/upstreamDials/upstreamRetryDials/upstreamRecoveries сохраняются
отдельно. Последний считает только успешную вторую upstream TLS verification.

Это TLS-interception: certificate, TLS fingerprint и timing отличаются от прямого
соединения. `CODEX_CA_CERTIFICATE` может также переключить HTTP-клиент Codex на
rustls. Поэтому обе ветки A/B используют один observer; результаты нельзя
выдавать за измерение неизменённого прямого транспорта.

OpenSSL создаёт отдельные CA и server certificate. Private keys проходят только
через anonymous pipes и остаются в RAM. Временные файлы содержат только публичные
CA/CSR; доверие к CA передаётся только дочернему процессу через `CODEX_CA_CERTIFICATE`.
Инструмент не редактирует глобальную конфигурацию, trust store и auth-файлы.
Нативный login/refresh идёт напрямую через `auth.openai.com`, вне observer. Proxy credential
передаётся в child env и исключается из окружения исполняемых моделью команд.
После завершения удаляется публичный сертификат, ключевые buffers обнуляются,
собственная process group останавливается и проверяется.

Для модели используется stock `codex --no-daemon exec --ephemeral --json`, approval
`never`, sandbox `read-only`. CLI получает `history.persistence="none"` и
`sqlite_home="/dev/null"` (под Linux по этому пути нельзя создать файлы базы).
Запуск использует in-process exec. Отчёт фиксирует запрошенный ephemeral-режим.
Поведение внутреннего логирования конкретной сборки по номеру версии не устанавливается.
История, CLI JSONL, tool output и response events обрабатываются в RAM.
`CODEX_ROLLOUT_TRACE_ROOT` и `SSLKEYLOGFILE` запрещены; core dumps должны быть
отключены для процесса. Нативная авторизация Codex используется без копирования
credentials.

Перед запуском проверяются известные local config layers. Configured hooks,
notify, remote policy selectors, linked worktrees и нестандартная
`shell_environment_policy` требуют отдельного аудита: инструмент отказывается от
запуска, сохраняя обязательные gates. `RUST_LOG` выключен, OTel exporters отключены.
Отказ не заменяется отключением hooks или обходом AGENTS.

## События и покрытие

Выход — закрытая проекция: фиксированные enums, counts, usage и HMAC-SHA256.
Временный HMAC key общий для cohort, не передаётся модели и не сохраняется.
Хеши сравнимы только внутри этого cohort; по ним нельзя восстановить запрос.
Не выдаются payload, текст инструкций/сообщений, tool arguments/results,
reasoning, Authorization/Cookie, URL, приватные ключи или тексты исключений.

Отдельно хешируются application JSON bytes, canonical JSON, упорядоченные tools,
options, cache key, input items и выбранные affinity headers. Канонизация сортирует
object keys, сохраняя массивы, строки, Unicode, IDs и неизвестные поля. Для input
сравниваются identity/content/metadata parts; для tools сохраняется порядок HMAC.
WS `previous_response_id` помечает delta: она не объявляется полным input или
доказательством logical prefix. Prewarm отделён от generation.
Presence flags и `toolShape` отличают отсутствие поля от `null` или переданного
значения; равенство hashes отсутствующих полей не доказывает effective tools или
instructions. `clientMetadataHash` выделяет служебный `client_metadata` из opaque
options без сохранения его содержимого.
Usage prewarm сохраняется отдельно и не включается в совпадающий с CLI
generation usage; это не утверждение о биллинге prewarm.

Парсеры поддерживают HTTP/1 framing/SSE, gzip/br/zstd и WebSocket masking,
fragmentation, control frames и permessage-deflate context takeover. HTTP/2
декодируется двумя отдельными RAM sessions без передачи их generated bytes;
correlation учитывает physical connection и stream. Превышение
лимитов, неподдержанный формат или неоднозначная correlation дают явное неполное
покрытие без raw fallback. Coverage нельзя объявлять успешным при нуле request
events. Usage terminal events дедуплицируется и сверяется с native CLI usage;
неизвестное usage не превращается в ноль. Доставка обязательных Markdown sections
проверяется в фактических model-visible messages/tool outputs; metadata и reasoning
не доказывают доставку. Prewarm ack может связать полный input с последующей delta.

Отклонённый CONNECT учитывается отдельным `relay_policy_rejection`: upstream
ещё не открыт и application request не передан. Это не потерянный payload.
Отказы не скрываются; полнота generation по-прежнему требует всех terminal events
и точного совпадения observer/CLI usage. Неполное TLS/HTTP/WS покрытие остаётся ошибкой,
включая поздние EOF events при закрытии relay после всех CLI phases.
Начиная со схемы `8` отдельно подтверждаются `finalCoverageComplete` и целевое
`expectedReaderCalls: 6` текущего профиля из 788 обязательных строк.
Дополнительно требуются ровно `reads + expectedInspects` command calls и одна
успешная `verify:runtime` внутри первого inspect. Счётчики `runtimeChecks`,
`runtimeChecksPassed`, `runtimeChecksCombined` должны быть равны единице;
отдельная проверка, повтор или отсутствие штатного success marker блокируют gate.
Каждый model request дополнительно обязан следовать `connected` того же physical
CONNECT в своей CLI-фазе (`upstreamTlsConfirmed`). Старые schema `6/7` cohorts
сохраняют исходную оценку и не переоцениваются.
Закрытие capture после `socket.destroy()` явно завершает обе стороны parser;
неполные frames и model streams остаются ошибками. Для `http2_truncated` разрешены
только фиксированные EOF flags и ограниченные числовые counts, без headers/paths/IDs.

Для каждого reader-call сохраняется ограниченный `readerDiagnostics`: порядковый
номер, status enum, exit `0..255` либо `null`, размер ответа, точный известный код
`INVALID_INPUT`/`READ_FAILED`/`LINE_TOO_LARGE` и закрытые причины отказа проверки.
Неизвестные тексты, command, argv и stdout не сохраняются. До 32 записей на CLI;
потеря записей, ошибочный outcome или truncation блокируют приёмку.
`invalidReads` считает нарушения: один failed reader может дать два нарушения,
например execution failure и невалидный JSON, оставаясь одним вызовом.

Первый reader-call в обоих вариантах задаётся готовой командой с тремя обязательными
sources и явными `startLine: 1`/`endLine: null`. Далее единая очередь сохраняет порядок
обязательного manifest: сначала весь `pending`, затем следующие ещё не выбранные
sources до трёх selections суммарно. Источник помечается выбранным при первом enqueue,
а его остатки приходят только через `pending`. Свободные места заполняются, пока
есть следующий обязательный source; бюджет каждого вызова остаётся 12288 bytes.
Локальная регрессия воспроизводит 7 пакетов при недозаполнении третьего вызова
и 6 при заполнении очереди, с одинаковым полным покрытием. Это новый критерий
замороженного smoke-profile; прежние отчёты задним числом не переоцениваются. Тексты
документов в prompt не подставляются. Это устраняет неоднозначность первого ввода
без пропуска инструкций. Исторический argv A2 не сохранялся; конкретное ошибочное
поле прежнего вызова не восстанавливается из хешей.

Одинаковые клиентские signatures не доказывают равенство серверного token prefix
или причину cache miss. Диагностика не восстанавливает отсутствовавшие исторические
payload. Если `cached=0` не повторился, прежняя причина остаётся неизвестной.
Параметры cache retention/diagnostics не добавляются в запросы.

Для текущего inspect-profile все операции используют один existing renderer
`renderGitInspectSummary.controller.ts` с `pipefail`. Он сохраняет success metadata,
fingerprint, worker, status counts и исходный `truncated`, заменяя список paths явной
компактной проекцией. Ошибки/unknown/overflow проходят без изменения; они не
засчитываются как нормализованный success. Это opt-in данного задания, без смены
общего Git-адаптера или default skill.

Gate проверяет компактный envelope и в CLI stdout, и в фактически доставленных
tool outputs: для каждой операции нужен один summary report до 4096 bytes,
согласованные counts/truncated и все прежние success/usage/coverage проверки.
Wire proofs содержат только HMAC input item, ordinal, shape и числовые метрики;
повтор full prefix не считается новой операцией, примеры в документах — не evidence.
Размер JSON report не включает CodeMode wrapper. Raw stdout, paths и payload не пишутся.

Рост uncached раскладывается по новым input tokens и signed carry из предыдущих
input/cached counters. Это бухгалтерское тождество, не token identity и не причина
server miss. Две серии сравниваются как наблюдения: изменения output shape и
текста задания не позволяют отдельно приписать эффект каждому исправлению.

В сопоставлении AB 2026-11-19/06 и 2026-11-20/01 рост 39676 uncached (+47,43%)
равен изменению input −4 минус изменение cached −39680. Cached различается только
у шести из 38 generation requests, при одинаковых 788 строках, шести reader-пакетах
и шести compact reports. Backend diagnostics недоступны: причина отдельных
server misses не установлена. HMAC разных cohorts несравнимы из-за разных RAM keys.

Текущий профиль убирает управляемые расходы: общий текст задания одинаков до
завершающего лимита one/three inspect, разделители — настоящие newlines;
обязательная проверка runtime объединена с первым inspect через `&&`, без
отдельного model roundtrip. Остальные inspect используют прежний pipeline.
Reader-команды и шесть пакетов не меняются. Это сравнение объединения операций
при новом общем профиле, а не изолированный эксперимент cache routing или
доказанное исправление исторических server misses. Ни cache key, ни retention,
ни provider/model/reasoning не подменяются; случайный cache miss остаётся видимым.

## Запуск

Требуются pinned Node/npm, установленный native Codex CLI в `PATH`, OpenSSL и действующая
нативная авторизация. Запускай из корня проекта:

```bash
npm run verify:runtime
codex --version
ulimit -c 0
node --import=tsx/esm .ai/tools/codex-request-diagnostics/src/runSmoke.controller.ts diagnostic /tmp/git-inspect-D0-hashes.json
```

`diagnostic` выполняет одну bounded read-only задачу D0 с одним свежим inspect.
В схеме отчёта `9` поле `cliVersion` содержит номер сборки из `codex --version`
или `null`, если номер получить не удалось. Версия служит для воспроизведения
измерения. Допуск исполнителя проверяется отдельно для конкретной сессии
по [контракту назначения](../worker-assignment/README.md#проверка-реального-транспорта-до-передачи-назначения).
Файл результата создаётся с `wx`/`0600`: существующий файл не перезаписывается.
Он содержит только безопасные диагностические события и агрегаты.

После разбора D0 и обоснованного исправления зафиксируй sources/config и запусти
одну серию из четырёх CLI invocation и шести Git operations:

```bash
node --import=tsx/esm .ai/tools/codex-request-diagnostics/src/runSmoke.controller.ts ab /tmp/git-inspect-AB-hashes.json
```

Порядок: A1,B1,A2,A3. A выполняет три задачи по одному inspect в новых ephemeral
CLI. B выполняет три отдельных последовательных inspect в одном user turn нового
ephemeral CLI. Старт B входит в стоимость. Обязательные актуальные инструкции
читаются один раз в каждом CLI; каждый inspect заново проверяет checkout.
Такое A/B оценивает объединение операций и reuse контекста целиком, включая форму
задания. Это не изолированный тест cache key или трёх отдельных follow-up turns.
Модель, reasoning, provider URL, cache key и native transport принудительно не
меняются. Apps/plugins/MCP выключены одинаково в обеих ветках.

Acceptance требует полное чтение обязательных sources без повторов/усечения,
полный фактический SKILL text в наблюдавшемся input, один успешный programmatic
inspect в A/D0 либо три в B, одинаковые fingerprints/model/instructions, известное
совпадающее usage observer/CLI и подтверждённый cleanup. Неуспешная попытка сохраняется; скрытых
повторов, прогрева, cache purge и попыток до желаемого результата нет.

## Проверки

```bash
npx tsc --project .ai/tools/codex-request-diagnostics/tsconfig.json
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/requestFingerprint.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/applicationStream.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/http2Stream.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/diagnosticRelay.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/connectVerifiedUpstream.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/sourceWireCoverage.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/cliVersionReport.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/assertSafeCodexLaunch.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/smokeCoverage.test.ts
node --import=tsx/esm .ai/tools/codex-request-diagnostics/test/contextReadingSmoke.test.ts
```

TLS fixtures требуют только локальные sockets и синтетические данные. Реальные
модельные requests относятся к отдельным smoke-tests. Source headers проверяются
штатным `check:headers` для явного списка изменённых исходников.

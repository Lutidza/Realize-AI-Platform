# 10. Интеграция системного и installation AI-layer

- **Статус:** target specification
- **Дата сверки реализации:** 4 октября 2026 года (PLAT-03, §10.11)

## 10.1. Разделение владельцев

Системный слой поставляется платформой и включает security/license policy,
`.ai/**`, `.codex/**` adapters, capability/check registries, system prompts и
runtime compiler. Он не доступен для изменения из обычной клиентской Admin.
Авторитетные production policy и системные инструкции публикует владелец
платформы в своём AI-сервисе. Клиент может менять код сайта и installation
overlay; это не даёт изменения системного ядра. Граница поставки и общие
версии определены в [контракте платформы](40-platform-versioning-and-updates.md).

Installation overlay хранится в Payload как versioned product data: skills,
knowledge, prompt templates, local rules, roles, check bindings, agent profiles
workflows и evals. Он только сужает или дополняет поведение внутри системных
разрешений.

## 10.2. Компиляция Context Pack

Для каждого run compiler фиксирует:

- manifest платформы и версию контракта совместимости;
- system release/version;
- installation config release и hash;
- actor, installation и license projection;
- разрешённые capabilities и protected scopes;
- выбранные instructions и bounded knowledge excerpts;
- check/policy versions;
- происхождение и hashes реально включённых инструкций;
- request и correlation IDs.

Context Pack ограничен по размеру, redacted и immutable для конкретного run.
Secrets, скрытые ресурсы, binary/runtime state и данные других инсталляций в
него не попадают.
Решения [Model Router](41-model-garden-and-router.md) связываются с конкретными
run/step/attempt до provider-вызова, сохраняя версии model/catalog/adapter/policy
и тарифного снимка. Новый выбор для этапа не переписывает исторический Context Pack.

До передачи пакета оркестратор сверяет выбранного исполнителя, фактические права
и их привязку к попытке по [общему контракту допуска адаптера](../../../../architecture/assignment-adapter/contract.md).

## 10.3. Приоритет и недоверенный контент

```text
security + license ceilings
> system runtime instructions
> active installation release
> actor request
> retrieved/site/external content
```

Prompt, skill, knowledge document, code comment, upload или web page не может
выдать tool authority, изменить identity или отключить gate. Tool calls
валидируются по server-side capability descriptor независимо от текста модели.

## 10.4. Изменение overlay

Целевой draft проходит schema validation, policy lint, injection checks и eval
suite. Создание immutable release и его активация — отдельные команды.
Activation переключает versioned active pointer на проверенный выпуск;
rollback переключает его на более ранний совместимый выпуск. Runs сохраняют
исходный snapshot и hash и не пересобираются задним числом.

Текущая реализация проверяет schema, ссылки и компиляцию всех включённых
профилей внутри server ceiling; eval suite ещё не подключён. Create release
фиксирует ready revision и переводит draft в `released`. Activate/rollback
сверяют release hash, system manifest и ожидаемую версию pointer. Общая
транзакционная блокировка, append-only pointer и audit event обеспечивают CAS;
durable replay возвращает исходный результат и после последующих переключений.

## 10.5. Декларативный workflow

`WorkflowDefinition` является versioned installation artifact и содержит
stable key, entry step, ограничение числа шагов и типизированный граф. Первая
версия поддерживает только шаги `agent_turn`, `request_input`, `capability`,
`check`, `branch` и `finish`.

Все ссылки workflow разрешаются внутри exact configuration release. Граф обязан
иметь существующий entry step, уникальные ключи, достижимые terminal steps и не
может содержать циклы. `Capability` step создаёт типизированное намерение для
Change Engine, а не вызывает executor напрямую. Installation workflow может
выбрать или дополнительно сузить доступную capability и добавить check, но не
может убрать системный gate, расширить scope или зарегистрировать executable.

Предложенные presets и настройка pipeline
[Мастерской дизайна](../../../design-workshop.md#pipeline) должны использовать
этот configuration lifecycle и редактор workflow. Domain capabilities,
artifact inputs и versioned publisher инструкций ещё требуется реализовать;
наличие новых `.ai`/`.codex` файлов не добавляет их в активный AIConfigRelease.

## 10.6. Детерминированная компиляция

Configuration compiler канонизирует JSON с упорядоченными object keys и
стабильным порядком artifacts, проверяет ссылки и вычисляет SHA-256 каждого
artifact и всего manifest. Effective agent context собирается только из exact
system release, immutable installation release и выбранного agent profile.

Изменение system release, installation release или agent profile меняет
`compiledContextHash`. Runtime отдельно связывает его с выбранной моделью,
текущими developer instructions, включая web-search policy, и версией политики
контекста в `runtimeContextHash`. Последний завершённый provider thread
переиспользуется только при совпадении этого fingerprint и отсутствии
подключённых инструментов discovery. При несовпадении
или отсутствии старого fingerprint создаётся новый thread; сохранённые реплики
передаются как недоверенные данные объёмом не более 32 КиБ UTF-8.

Обычный чат с инструментами чтения Pages всегда создаёт новый provider thread:
установленная схема App Server принимает `dynamicTools` в `thread/start`, но
не заменяет их при `thread/resume`. Сервер передаёт ограниченную историю
сохранённых реплик и заново регистрирует точный набор tools; прежний снимок
страницы из истории не становится основанием нового изменения.

## 10.7. Текущий chat runtime

При отсутствии active pointer чат использует системную конфигурацию. Если
выпуск активен, следующий запуск связан с точным выбором включённого профиля.
При первом чтении UI выбирает единственный профиль и показывает его по имени;
при нескольких профилях выбор делает пользователь. Browser
передаёт только `releaseID`, `manifestHash` и `profileKey`; устаревший выбор
отклоняется. Сервер компилирует immutable release с текущей system projection
и сохраняет закрытый `AIChatConfigurationSnapshot` в `runs.turnContext`.
Control plane принимает его только через авторизованный серверный transport
и проверяет форму, content hashes и общий compiled hash. Эта проверка
подтверждает целостность, не предоставляет полномочия и не заменяет compiler
или текущую runtime policy.

С 4 октября каждый новый run, в том числе без overlay, дополнительно сохраняет
`systemRelease` и передаёт его в control plane. Сервер требует точную пару
release ID/hash из встроенного доверенного registry и повторно проверяет
capability ceiling и обязательные checks. Самостоятельно пересчитанный
клиентом compiled hash не проходит эту проверку при расширении полномочий.

Renderer применяет описание и locale профиля, прямые роли, правила по убыванию
priority с ключом как вторичным порядком, навыки как условные процедуры
с `triggerTerms` и только прямые `promptTemplateKeys` с
`slot: agent_instructions`. Поддержаны переменные `request`, `context`,
`profile_key`, `profile_title`, `locale`. Подстановка выполняется один раз
как JSON-quoted данные; default `context` содержит только ключ, название
и locale профиля. Неизвестная переменная активного шаблона вызывает ошибку.

В обычном сообщении slots `planner`, `reviewer`, `workflow_step` и шаблоны,
выбранные только шагами workflow, в инструкции чата не включаются.
Явно выбранный workflow использует отдельное исполнение, описанное ниже.
Доступ к инструментам, sandbox и approvals задаются существующей серверной
политикой независимо от текста installation config. Наличие capability/check
reference само по себе не подтверждает выполнение или выдачу прав.

Рабочий каталог аналитического чата содержит изолированный Context Pack,
а не Git checkout. Серверное чтение проекта выполняют разрешённые `repo_*`
инструменты; `repo_git_head` с пустыми аргументами возвращает только текущие
`head`, `branch`, `detached`, `unborn` из server-owned workspace. Он использует
те же repository ACL и общий budget, доступен через direct functions и native
MCP и не предоставляет произвольные команды или `.git`. Git внутри временного
каталога не является диагностикой проекта; недоступность Git-инструмента
отделяется от доступности файлов. Подробные границы — в
[интеграции Codex](../../../../architecture/codex-integration.md) и
[MCP tooling](../../../../architecture/mcp-tooling.md).

Сериализованный snapshot ограничен 2 000 000 символов и 8 МиБ UTF-8;
результат renderer — 128 КиБ UTF-8. Control plane дополнительно ограничивает
JSON с `developerInstructions` и `prompt` 256 КиБ UTF-8. Переполнение инструкций
и подстановок вызывает явную ошибку, без усечения правил. Публичный RunDTO
содержит только сводку выбора и хешей. Контракты persistence и API описаны
в [модели данных](../03-runtime-delivery-and-security/21-ai-plugin-data-model.md)
и [API](../03-runtime-delivery-and-security/22-api-and-streaming-contracts.md).

В обычном чате доступны три server-owned инструмента: `pages_search`,
`pages_read`, `pages_structure`. Они подключаются только при включённой текущей
интеграции, host text adapter и `canManageData`; workflow их не наследует.
Определения и callback задаёт сервер, browser и модель не передают исполняемый
код, endpoint или полномочия. Callback использует отдельный HMAC-допуск на
15 минут, подписанный существующим control-plane token, привязанный к run и
администратору. Допуск остаётся в закрытом серверном transport и не попадает
в prompt, RunDTO или события UI. Payload повторно проверяет текущие права,
интеграцию и состояние run перед чтением.

Codex opt-in `experimentalApi` включается только при зарегистрированных tools.
Adapter принимает только `item/tool/call` для точного имени без namespace,
с подтверждёнными thread/turn ID и новым callID. Пределы adapter: 16 вызовов,
4 одновременно, 16 КиБ аргументов, 128 КиБ одного ответа и 512 КиБ ответов
за turn; сервис Pages дополнительно ограничивает persistent журнал 12 вызовами.
Результат передаётся модели как ограниченный текстовый JSON, а UI получает
общие события чтения без raw arguments/results. Незнакомые requests/tools,
MCP и запросы approval по-прежнему блокируются; sandbox filesystem/network
не расширяется. Сбой обработчика не может быть скрыт ранним `turn/completed`.
Контракт данных и сохранённых снимков описан в
[поиске страниц](../02-change-engine-and-pipelines/14-data-config-pipeline.md#1410-самостоятельный-поиск-и-чтение-страниц).

Обычный чат может предложить `pages.updateStructureDraft.v1` по stable IDs из
прочитанных в том же run порций. Callback сохраняет до восьми порций структуры
и до трёх текстовых снимков; общий размер двух массивов — до 384 КиБ UTF-8.
Exact replay структуры повторно проверяет ревизию, каталог и доступ к ссылкам.
Инструменты остаются читающими; новый intent проходит существующие Data Lane
preview, подтверждение, apply и rollback. Подробности —
[структурный сервис Content](../02-change-engine-and-pipelines/14-data-config-pipeline.md#1411-структурное-редактирование-content).

## 10.8. Исполнение workflow сегментами

Администратор явно выбирает процесс выбранного профиля перед отправкой сообщения.
`defaultWorkflowKey` не запускает процесс автоматически. Сервер берёт definition,
шаблоны и bindings только из сохранённого exact configuration snapshot.
Один существующий `AIRun` исполняет сегмент: сервер проходит `branch`,
`capability` и `check` до одного `agent_turn`, вопроса `request_input` или `finish`.
После `agent_turn` checkpoint готов к следующему сегменту; продолжение запускается
кнопкой. Для `request_input` пользователь вводит ответ в обычном поле чата.

`agent_turn` выполняет один bounded read-only вызов через control plane.
Инструкции профиля дополняются exact шаблоном шага и JSON-данными input/outputs;
данные передаются и тогда, когда шаблон не использует `context`. Доступны прежние
переменные `request`, `context`, `profile_key`, `profile_title`, `locale`.
Подстановка однократная, JSON-quoted; общий результат ограничен 128 КиБ UTF-8.
`request_input` не вызывает модель: публичный вопрос содержит только rendered
шаблон, исходный запрос и безопасные metadata профиля/шага, без private instructions
и результатов других шагов.

Исходные значения находятся в `input`; зарезервированный `request` назначает
сервер из первого сообщения. Ответ на вопрос и результат агента записываются
в `outputs[stepKey].text`. Путь сначала проверяется как exact own key; если такого
ключа нет, путь с начальным `/` трактуется как RFC 6901 JSON Pointer.
Dot notation не выполняет вложенный обход. Отсутствующее значение отличается
от `null`, `false`, нуля и пустой строки; `exists` проверяет наличие.
`equals`/`not_equals` сравнивают canonical JSON, отсутствие операнда останавливает
шаг. Результаты будущей или пропущенной ветви недоступны.

`capability` поддерживает текущий `catalog.assignCategory.v1`: проверяет выбранный
binding и действующий server ceiling и создаёт настоящий DataOperation dry-run.
Workflow не выполняет apply или rollback и не заменяет отдельные approvals.
`check` проверяет сохранённый preview последней capability этого процесса,
его audit provenance, владельца, hash и актуальное состояние доступных данных.
Без такого контекста шаг блокируется; произвольного executable check registry нет.
`finish` завершает workflow с результатом `completed` или `blocked`.

Checkpoint сохраняется в Payload JSON и содержит version, phase, текущий шаг,
суммарный счётчик и ограниченные input/outputs. Максимум — 64 выполненных шага
и 128 КиБ UTF-8 всего checkpoint; JSON имеет depth до 12, arrays до 256 элементов,
objects до 128 полей, ключи до 240 символов и строки до 32 000 символов.
Для продолжения сервер проверяет владельца и exact version/step, затем атомарно
создаёт единственного дочернего run. Он наследует исторический snapshot;
переключение active pointer не меняет запущенный процесс.

Локальный control-plane run store остаётся в памяти. Сохранённые завершённые
checkpoints переживают перезапуск; потерянный незавершённый provider turn
останавливается с `run.failed`/checkpoint `blocked`, если CP возвращает `404`
для уже `running` запуска, и не исполняется повторно. Ещё `queued` сегмент
с phase `running` можно явно передать повторно с тем же run ID, включая
восстановление после загрузки страницы; это не создаёт дочерний run.
Это не production durable worker. Workflow пока не принимает вложения и выбор
файлов проекта; существующий явный переключатель web search применяется
к его read-only agent turns.

## 10.9. Управление запусками

Раздел `/admin/ai/runs` показывает актуальные процессы текущего пользователя
с серверными поиском, фильтрами и пагинацией. Карточка корня содержит цепочку
сегментов, выполненные/текущие/ожидающие/пропущенные шаги, безопасные результаты,
проблемы и актуальные операции данных. Продолжение, ответ и восстановление
используют те же команды и общий SSE bridge, что и чат; открытие карточки
само по себе не запускает новый сегмент.

Ссылки на определение процесса и профиль открывают запись в immutable выпуске
этого запуска. Они не подменяют её текущим черновиком или активным выпуском.
Реестр не становится новым workflow engine или runtime store. Его DTO и
границы чтения заданы в [API реестра](../03-runtime-delivery-and-security/22-api-and-streaming-contracts.md#227-реестр-и-история-запусков-процессов).

## 10.10. Инженерный контракт рабочего слоя

Целевая дисциплина развития инструкций реализуется задачей
[PLAT-01](../06-execution-governance/32-immediate-implementation-order.md).
Рабочие требования хранятся у существующих владельцев:

| Артефакт        | Ответственность                                          |
| --------------- | -------------------------------------------------------- |
| `AGENTS.md`     | Короткий вход, обязательные ограничения и маршрутизация  |
| `.ai/rules`     | Требования, условия применения и допустимые исключения   |
| `.ai/checks`    | Критерии проверки и достаточное evidence                 |
| `.ai/workflows` | Порядок действий и условия переходов/остановки           |
| `.ai/roles`     | Ответственность и основания для привлечения специалистов |
| `.ai/registry`  | Навигация и связи, без второго текста требования         |
| `.codex`        | Настройки и процедуры конкретной среды Codex             |
| `documentation` | Архитектура и контракты продукта                         |

У требования один основной источник; изменение синхронизирует связанные
проверки и adapters. Обязательное ядро компактно, профильные инструкции
загружаются по применимости. Для правила определены требование, trigger,
проверка, исключения и действительное основание остановки. Сложность проверки
соответствует риску изменения; уже предоставленное разрешение не запрашивается
повторно. Роль сама по себе не запускает отдельного worker.

Проектный слой действует в пределах инструкций среды и задания пользователя.
Его название «системный» не повышает приоритет файлов над реальными системными
инструкциями модели и не создаёт tool authority.

Разработка платформы и клиентский runtime используют разные применимые наборы
инструкций из общей управляемой системы. Publisher явно определяет состав,
версии и совместимость; автоматическое копирование всего `.ai/.codex` в каждый
run или в редактор Admin не является синхронизацией. Структурная проверка и
сценарные evals описаны в [стратегии качества](../04-commercial-and-operations/29-testing-strategy.md),
их расходы входят в общий ledger. Эта целевая глава не подменяет действующие
правила `.ai` до их отдельного обновления.

## 10.11. Опубликованный system AI release и исполнение

**Текущий срез PLAT-03 с обновлением PLAT-04, 5 октября 2026 года.** Owner source находится в
`.ai/rules/runtime/RULE-CUSTOMER-AI-RUNTIME.md`. Явный состав публикации задан
`packages/change-engine/src/system-ai/systemAIRelease.source.json`;
capabilities берутся из `systemCapabilities.config.ts`. Publisher
`scripts/release/publishSystemAIRelease.controller.ts` выпускает JSON artifact
с ID, версией, текстами и hashes инструкций, hashes исходников builders и
consumers, capability/check registry, protected resources и командами проверок.
Время запуска генератора и локальный абсолютный путь в manifest не входят.
`npm run ai:system:check` обнаруживает расхождение источников и artifact и
включён в `npm run ci`.

Изменение доверенных builders или других перечисленных источников требует
нового `releaseID`/version и явной регистрации с сохранением прежних releases.
Publisher не перезаписывает существующий ID с иным содержимым. Сначала
завершаются owner sources, список provenance и registry, затем выполняются
`npm run ai:system:publish` и `npm run ai:system:check`; generated artifact
вручную не редактируется. При точной compatibility старого installation overlay
новый system release требует совместимого overlay release через штатные
draft/validate/release/activate handlers. Если инструкции установки не меняются,
проверяется сохранность каждого artifact и content hash. Web, control plane,
execution и active overlay переключаются согласованно: смешанная пара версий
может отклонить каталог профилей и новые runs. Откат также проверяет совместимость
обоих выпусков, а не только старый pointer; история runs не переписывается.

Runtime импортирует artifact из контролируемой владельцем сборки. Он не читает
`.ai`, `.codex` или AGENTS.md из клиентского checkout для восстановления policy.
`SYSTEM_AI_CONFIG_PROJECTION.manifestHash` теперь относится к полному system
release, сохраняя существующий compiler и формат overlay snapshot `1.0`.
Изменение active overlay pointer не меняет сохранённый run или workflow.
Activate/rollback сохраняют прежние транзакции, optimistic lock, replay и audit.
Новый system release требует явной регистрации; отсутствие или несовпадение
reference останавливает новый turn/continuation/execution без latest fallback.
Выпуск `realize-system-1.1.4` уточняет chat instructions и публикует provenance
ограниченного `repo_git_head`, сохраняя текст системного правила, capabilities,
check IDs и execution policy выпуска 1.1.2. Registry сохраняет неизменные
`realize-system-1.1.3`, `realize-system-1.1.2`, `realize-system-1.1.1`,
`realize-system-1.1.0` и `realize-system-1.0.0` для
исторических bindings. Все зарегистрированные artifacts проходят
проверку целостности; ID и hash должны совпасть с одним зарегистрированным выпуском.
После согласованной установки новые runs используют 1.1.4 и совместимый
installation overlay. Исторические инструкции не заменяются новыми, но
текущий runtime применяет metering и admission ко всем calls. Это сохранение
policy, а не эмуляция прежнего бинарного кода. Owner provenance 1.1.0 включает
финансовые contracts, нормализацию usage, runtime admission и consumers.

Chat и workflow получают опубликованный текст системного правила, затем
действующие mode-specific builders и выбранный overlay. При создании Change
Request сервер читает завершённый run того же пользователя и диалога.
Закрытый `AIExecutionContextSnapshot` сохраняет system reference, exact overlay,
source run ID, digest исходного контекста и запроса, собственный context hash.
Снимок копируется в job; context hash входит в plan approval и HMAC execution
capability. Executor до создания worktree проверяет подпись, system registry,
целостность/ceiling overlay, исходный запрос, plan/scope hashes и равенство полей
job подписанным claims. Реальные инструкции исполнителя включают этот snapshot;
повторной компиляции из активного overlay или изменённого черновика нет.

Server policy отклоняет защищённые owner paths, AGENTS.md/AGENTS.override.md,
`.ai`, `.codex`, `.agents`, `.git`, `.github`, environment/credential files и
dependency manifests. Она проверяется при выдаче допуска, перед worktree и при
приёмке diff; directory scope не расширяет доступ к защищённым именам.
Пути Next с `(group)` и `[slug]` остаются literal paths. Изолированный результат
не получает права на commit, push, deploy или изменение ядра платформы.
Работа владельца из IDE использует отдельный корневой протокол разработки.

В product adapter Codex устанавливаются `project_doc_max_bytes=0`, пустой
fallback AGENTS и `projects={cwd={trust_level="untrusted"}}`. На CLI 0.160.0
проверены effective config и игнорирование тестовой `.codex/config.toml`;
вызов модели для этого не выполнялся. Режим не включён в отдельном Git worker.
Семантика параметров описана в [официальной документации Codex](https://learn.chatgpt.com/docs/config-file/config-reference).

Исторические runs/CR/jobs без нового binding остаются читаемыми. Они не получают
текущий release автоматически: для нового исполнения нужен новый run и план.
Web, control plane и execution worker обновляются согласованно после миграции;
переход БД и защита rollback описаны в [runbook миграций](../../../../delivery/03-migrations-and-rollback.md).
Overlay с прежним system manifest hash нужно заново выпустить и активировать
через существующий Config. Автоматическая перепривязка исторического release
к новому системному artifact запрещена.

Hash обеспечивает целостность, а происхождение policy обеспечивается доверенной
сборкой/процессом владельца. Этот срез не является удалённым multi-tenant AI
сервисом, подписью release или защитой от пользователя, контролирующего сам host.
Физическое отделение закрытого ядра, tenant credentials и production isolation
остаются обязательным PLAT-10 до внешнего пилота. Publisher доменных инструкций
Мастерской и её capabilities также не объявляются реализованными этим срезом.

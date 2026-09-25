# 10. Интеграция системного и installation AI-layer

- **Статус:** target specification
- **Дата сверки реализации:** 13 сентября 2026 года

## 10.1. Разделение владельцев

Системный слой поставляется платформой и включает security/license policy,
`.ai/**`, `.codex/**` adapters, capability/check registries, system prompts и
runtime compiler. Он не доступен для изменения из обычной клиентской Admin.

Installation overlay хранится в Payload как versioned product data: skills,
knowledge, prompt templates, local rules, roles, check bindings, agent profiles
workflows и evals. Он только сужает или дополняет поведение внутри системных
разрешений.

## 10.2. Компиляция Context Pack

Для каждого run compiler фиксирует:

- system release/version;
- installation config release и hash;
- actor, installation и license projection;
- разрешённые capabilities и protected scopes;
- выбранные instructions и bounded knowledge excerpts;
- check/policy versions;
- request и correlation IDs.

Context Pack ограничен по размеру, redacted и immutable для конкретного run.
Secrets, скрытые ресурсы, binary/runtime state и данные других инсталляций в
него не попадают.

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

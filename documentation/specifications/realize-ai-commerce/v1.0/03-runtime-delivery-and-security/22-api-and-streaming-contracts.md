# 22. API и streaming contracts

- **Статус:** target specification
- **Дата сверки реализации:** 11 сентября 2026 года

## 22.1. Общие правила

Payload API namespace — `/api/realize-ai`. Browser использует authenticated
same-origin calls. Request DTO versioned, strict и не принимает доверенные
identity/role/risk значения. Mutation поддерживает idempotency key и
`expectedVersion`; hash-bound commands также передают ожидаемый artifact hash.

Success и error DTO не раскрывают stack, prompt, secret или protected content.
Stable error codes различают forbidden, conflict, stale approval, validation,
rate limit, unavailable dependency и internal failure.

## 22.2. Текущие группы API

Current runtime содержит status, integrations, conversations/messages,
changes/approvals, data operations/apply/rollback, execution/acceptance,
preview, source promotion, release candidates, runs/events/cancel.

Это описание групп, а не гарантия универсальных capabilities: фактический Data
Lane поддерживает `catalog.assignCategory.v1`, `pages.createDraft.v1` и `pages.updateDraft.v1`.

### Готовность ответа к оформлению плана кода

`MessageDTO.changePlan` передаёт вычисленную сервером готовность сохранённого
ответа к `POST /conversations/:id/changes`:

| `status` | `reason` | Поведение интерфейса |
| --- | --- | --- |
| `ready` | — | Доступно «Оформить план изменения» |
| `needs_clarification` | `missing_paths` или `too_short` | Пояснение и «Уточнить изменение» |
| `unavailable` | `data_operation` или `not_assistant` | Действия оформления плана кода отсутствуют |

Проекция и `deriveChangePlan` используют одну проверку Change Engine. Наличие
полного или повреждённого `realize-data-operation` блока исключает code plan.
Готовность не является подтверждением плана или разрешением исполнения:
POST повторяет проверку, далее сохраняются отдельные approvals и scope policy.
При workflow, существующем Change Request или отключённом инструменте
интерфейс также не предлагает новое оформление.

«Уточнить изменение» дополняет текущий черновик сообщения запросом различить
данные CMS и код и переводит фокус в редактор. Запрос не отправляется
автоматически. Если дополнение не помещается в поле, интерфейс объясняет
ограничение и сохраняет набранный текст целиком. Для данных запрос не требует
выдумывать изменения файлов или
отсутствующую операцию; для кода просит точные пути и проверки. В ответе без
`changePlan` оформление скрыто. После завершения SSE повторный GET detail
возвращает ту же проекцию, что загрузка истории; новая схема хранения не нужна.

Разбор scope поддерживает относительные пути с `./`, Markdown подписи с
точными путями, маршруты Next с `(group)`/`[slug]` и явные файлы корня, включая
`README.md` и `next.config.ts`. Абсолютные URL/workspace пути и выход за корень
не преобразуются в разрешённый scope.

### Операции данных и черновик страницы

Операции используют существующие endpoints; отдельный произвольный Pages
CRUD для модели не открывается. Пути ниже относительны к `/api/realize-ai`:

| Действие | Endpoint | Strict request body |
| --- | --- | --- |
| Подготовить dry-run | `POST /conversations/:id/data-operations` | `{sourceMessageID}` |
| Прочитать операцию | `GET /data-operations/:id` | — |
| Подтвердить или отклонить | `POST /data-operations/:id/approve`, `/reject` | `{expectedVersion, expectedOperationHash, comment?}` |
| Применить | `POST /data-operations/:id/apply` | `{expectedVersion, expectedOperationHash}` |
| Подтвердить или выполнить откат | `POST /data-operations/:id/approve-rollback`, `/rollback` | `{expectedVersion, expectedRollbackHash, comment?}` |

Mutation требует `Idempotency-Key`; отклонение требует непустой причины.
Подготовка читает только сохранённый ответ ассистента с одним валидным
`realize-data-operation` блоком. Browser не передаёт готовый `createData`,
права или собственный подтверждённый intent. Сервер проверяет принадлежность
диалога, права и текущие разрешения Data Lane. Для записи используются
также штатные access и hooks коллекции `pages`.

`DataOperationDTO` — discriminated union по `kind`. Общими остаются состояние,
`version`, `operationHash`, `rollbackHash`, сроки, решения и безопасная ошибка.
Ветка каталога сохраняет прежние поля и hashes. Ветка `pages.createDraft.v1`
содержит:

- `preview: {title, slug, sections: [{heading?, body}], description?, status: "draft"}`;
- `rollbackStrategy: "delete-created-draft"`, `riskLevel: "R1"` и `estimatedCount: 1`;
- после apply — `result: {page: {id, title, slug}, adminUrl}`. Ссылка строится
  сервером из настроенного маршрута Admin. После успешного отката результат
  удалённого черновика в DTO отсутствует.

`expectedTargetUpdatedAt` принадлежит веткам изменения существующего документа:
до создания страницы такой версии нет. После apply меняется `rollbackHash`,
который связывает отдельное решение об удалении с ID, версией и fingerprint
созданного черновика. Закрытые snapshot, Lexical/Content schema, пользовательские
документы за границу DTO не выдаются; read-контекст update передаёт только opaque fingerprint.

В UI страницы доступны последовательные действия «Подготовить изменение
данных», «Подтвердить создание», «Создать черновик», затем «Открыть черновик».
Текстовое «подтверждаю» в чате не заменяет hash-bound решение. Занятый адрес,
изменившийся рецепт, устаревшие version/hash и небезопасный откат отклоняются
как `CONFLICT`; неподдерживаемый intent — `INVALID_REQUEST`, отсутствие права —
`FORBIDDEN`. Полный контракт текста, транзакции и защищённого отката — в
[Data/Config Pipeline](../02-change-engine-and-pipelines/14-data-config-pipeline.md#145-создание-черновика-cms-страницы).

### Контекст и изменение существующей страницы

`GET /chat/page-drafts?q=&page=1` возвращает `{pages: [{id, title, slug?}],
page, totalPages, totalDocs}` с поиском по title/slug и лимитом 20. Поисковая
строка — до 128 символов. `GET /chat/page-drafts/:id` возвращает
`PageDraftContextDTO`: `{page, updatedAt, fingerprint, adapterVersion,
fields: [{path, label, value, maxLength}]}`. Обе операции требуют текущую
сессию чата, `canManageData`, подключённый host adapter и доступ Pages;
ответы `no-store`, без raw Payload.

`POST /conversations/:id/messages` принимает необязательный
`pageDraft: {id, fingerprint}`. Browser не задаёт текст снимка, version,
инструкции или права. Сервер перечитывает exact selection перед созданием
run; stale selection — `CONFLICT`, без отправки провайдеру. `ChatCapabilitiesDto`
содержит `pageDrafts?: {available}`. `MessageDTO.pageDraft?` показывает только
`{id, title, slug?}`; закрытый run context не выдаётся. Выбор вместе с workflow
отклоняется, как несовместимый контекст.

Ветка `DataOperationDTO.kind: "pages.updateDraft.v1"` содержит
`preview: {page, changes: [{path, label, before, after}], status: "draft"}`,
`expectedTargetUpdatedAt`, `rollbackStrategy: "before-snapshot"` и после apply
`result: {page, adminUrl}`. Общие approval/apply/rollback endpoints сохраняются.
В интерфейсе — полный diff, «Подтвердить изменения», «Сохранить черновик» и
отдельное восстановление предыдущего текста. Это не публикация и не удаление
страницы. Все пределы и проверки исходной версии описаны в
[Data/Config Pipeline](../02-change-engine-and-pipelines/14-data-config-pipeline.md#146-редактирование-текста-существующей-страницы).

### Управление админским агентом

`PUT /api/realize-ai/integrations/codex/agent-settings` сохраняет
`{expectedRevision, enabled, settings}` с `Idempotency-Key` и правом
`canManageIntegrations`. `settings` соответствует `CodexAgentSettingsDTO`:
основная модель, модель проверяющего, разрешения execution/preview/release/
sourcePromotion и сроки действия. Ответ — безопасный
`CodexIntegrationConnectionDTO`; секреты, чат и данные аккаунта не заменяются.
Сохранение использует общую блокировку подключения, revision CAS и аудит.

`connection.enabled` — единственное сохраняемое включение агента. Runtime
читает текущую интеграцию перед новыми действиями; старые env-переключатели
и env-модели не используются. `GET /status` различает выключение, отсутствие/
неисправность подключения и готовность, для которой нужен доступный control
plane. Выключение не блокирует историю, события принятых запусков, отмену и
откат. Проверки и preview имеют независимое инфраструктурное ограничение
`runtime.isolated`. Подробный контракт и значения по умолчанию — в
[архитектуре Codex](../../../../architecture/codex-integration.md).

`GET /api/realize-ai/integrations/codex/diagnostics` — read-only диагностика
для `canManageIntegrations`. Контракт `CodexAgentDiagnosticsDTO` содержит
`checkedAt`, `runtime`, безопасный `connection | null`, сохранённые `models`,
последний `accessTest`, четыре `operations` и `worker: WorkerAvailabilityDTO`.
`runtime` учитывает доступ к чату и авторизованную связь с control plane;
состояния операций `allowed/disabled/blocked` учитывают также свежего
исполнителя с возможностью соответствующего этапа. Занятый исполнитель
не блокирует постановку следующей задачи в очередь. Это не заменяет
согласование конкретного изменения и не подтверждает успешный запуск модели.

`WorkerAvailabilityDTO` содержит `state: available | busy | unavailable`,
`reason`, `lastSeenAt: string | null`, `activeCount`, `busyCount` и
`currentJob: {kind, changeRequestID} | null`. `kind` — `execution`, `preview`,
`sourcePromotion` или `release`. Источник состояния — служебная коллекция
`realize-ai-worker-presence`: heartbeat обновляется каждые 5 секунд, свежесть
ограничена 20 секундами по времени PostgreSQL. Публичного mutation API этой
коллекции нет. Секреты, адреса, PID, ключи экземпляров, серверные пути и ответы
внешнего протокола в DTO не входят.

`ChangeExecutionDTO.worker` передаёт ту же сводку в доступный пользователю
Change Request. Для выполняемого задания проверяется назначенный экземпляр;
наличие другого worker не скрывает потерю его сигнала. `currentJob` ограничен
этим Change Request и не раскрывает чужие задания. Потеря сигнала отражается
в диагностике, не переводя само задание в отменённое и не запуская повтор.

Проверка доступа остаётся существующим `POST /integrations/codex/test` с
revision/idempotency. Её сохранённые `lastTestStatus/lastTestedAt` независимы
от времени GET диагностики. GET не обновляет ни проверку доступа, ни heartbeat;
операционное состояние записывает сам worker.

## 22.3. Configuration API

Namespace `/api/realize-ai/config/*` предоставляет:

- CRUD только для draft skills, knowledge, prompts, local rules, roles,
  capability/check bindings, agent profiles, workflows и evals;
- `POST /config/validate`;
- создание immutable config release;
- отдельные activate и rollback commands с expected hashes.

System `.ai/.codex`, license/security policy и executable registries не имеют
client-editable endpoint.

Первый aggregate-oriented API slice имеет точный surface:

- `GET /config` — bootstrap projection: system ceiling, draft/release summaries
  и nullable active pointer;
- `POST /config/drafts` — создать editing draft с `expectedRevision: 0`;
- `GET /config/drafts/:id` — получить explicit draft DTO;
- `PUT /config/drafts/:id` — полностью заменить editable artifacts по exact
  aggregate revision;
- `POST /config/validate` — проверить exact draft revision и при success
  перевести её в `ready`;
- `POST /config/releases` — создать immutable release из exact ready revision и
  exact expected system manifest;
- `GET /config/releases/:id` — получить explicit immutable release DTO;
- `POST /config/activate` — отдельная команда `activate` или `rollback`;
- `GET /config/runtime` — каталог активного выпуска и доступных профилей
  для пользователя чата.

Payload регистрирует эти пути без `/api` как `/realize-ai/config/*`. Mutation
body всегда содержит `schemaVersion: "1.0"`, проходит exact-key parsing и не
принимает назначаемые сервером actor, timestamps, state, новую release version
или system policy от browser. Ожидаемые hashes передаются для сверки с серверными
записями и не заменяют их содержимое. Для каждой mutation обязателен
`Idempotency-Key`; canonical body,
action и resource binding входят в request hash. Mutation response возвращает
bounded summary/validation DTO, а полные artifacts читаются отдельным GET.

Create/update проверяют base release ID и hash по immutable server record.
Release command дополнительно передаёт `expectedSystemManifestHash`; server сам
назначает release ID/version/time/actor и exact compatibility с текущей system
projection. При валидации и создании выпуска все enabled agent profiles должны
успешно скомпилироваться внутри system capability/check ceiling. Сохранение
editing draft допускает семантически незавершённые связи при корректной
структуре DTO и ревизиях; выпуск такой конфигурации требует исправления ошибок.

Этот surface ещё не является полным target CRUD по отдельным artifact resources.
Отдельные DELETE endpoints, per-artifact routes и eval runner ещё не добавлены.
Activate/rollback не расширяют права редактирования или исполнения остальных
endpoints.

Первый aggregate-oriented surface реализован в
`packages/payload-ai-plugin/src/endpoints/aiConfig*.ts` и закрыт отдельным
`canManageAIConfiguration` access resolver. Исключение чтения —
`GET /config/runtime`, который использует `canUseChat` и не выдаёт содержимое
drafts, инструкций или capability bindings.

`POST /config/activate` принимает `schemaVersion: "1.0"`,
`action: "activate" | "rollback"`, `releaseID`, `expectedReleaseManifestHash`,
`expectedSystemManifestHash`, `expectedPointerVersion` и `Idempotency-Key`.
Ожидаемая версия равна 0 при отсутствии pointer. Сервер проверяет hashes,
компиляцию включённых профилей с текущим system ceiling и CAS под общей
транзакционной блокировкой config mutations. Rollback требует более раннюю
версию выпуска; повторная активация уже активного выпуска отклоняется.
Успех возвращает новый `ActiveAIConfigPointer`. Pointer и audit/idempotency
event сохраняются атомарно, replay возвращает исходный receipt независимо
от последующих переключений.

Admin `/admin/ai/settings` использует этот aggregate API для обзора, создания
и копирования черновиков, каталога и просмотра всех восьми видов artifacts,
редактирования правил, профилей, ролей, навыков, шаблонов инструкций,
связей возможностей и проверок, рабочих процессов, валидации,
создания и просмотра выпуска, его активации или rollback.
Поиск, фильтрация, сортировка, страницы по 25 записей и списки
прямых/обратных связей строятся на клиенте из полного draft DTO.
Bootstrap возвращает до 100 последних draft summaries
по времени обновления и до 100 release summaries по версии, без общего total
и cursor. Поиск и страницы раздела «Версии» ограничены этим загруженным набором.
«Системная основа» использует зарегистрированные capabilities/checkIDs из
bootstrap, не читает системные файлы и не предоставляет их редактор.

Изменение одной записи любого из восьми редактируемых видов передаёт весь состав
artifacts через существующий `PUT /config/drafts/:id`, сохраняя остальные объекты,
их ревизии и base release. Копирование профиля, роли, навыка, шаблона, связи
или процесса до сохранения меняет только локальную форму; при сохранении
новый artifact добавляется той же aggregate mutation. Выбор связей и просмотр использования работают
с полным draft DTO без дополнительных endpoints. Поля `triggerTerms`,
`slot` и `variables` используют существующие versioned контракты.
Структурная проверка формы дополняет серверный parser и не меняет `schemaVersion`
или серверные проверки связей и прав. Повтор неподтверждённой записи использует
прежние body и `Idempotency-Key`.
Если после подтверждения записи GET возвращает более новую ревизию, UI
показывает конфликт и требует явного обновления, сохраняя введённый текст.
Общие механизмы revision/CAS, повторов и защиты формы применяются ко всем восьми
редакторам. Создание выпуска и активация используют отдельные aggregate команды;
per-artifact endpoints редакторам не требуются.

Редактор `capability_binding` выбирает точные ID и версию из
`bootstrap.system.capabilities`, редактор `check_binding` — зарегистрированный
`checkID` из `bootstrap.system.checkIDs`. Сужение действий, областей чтения/записи
и числа объектов использует существующие поля DTO. Отсутствующие `readScopes`,
`writeScopes` и `maxTargets` наследуют системные ограничения; явный пустой массив
областей запрещает соответствующий доступ. Поле лимита хранит пользовательский
текст до структурной проверки и преобразуется в число только перед сохранением.
Неизвестные сохранённые цели и значения остаются видимыми и не удаляются
автоматически. Структурно корректную незавершённую связь можно сохранить
в editing draft; доступность системных целей и соблюдение ограничений проверяются
сервером при компиляции включённых профилей. Явно запущенный workflow применяет
bindings через существующий Data Lane, как описано в разделе 22.6.

Редактор `workflow_definition` использует ту же aggregate mutation. Локальные
идентификаторы шагов и входных параметров, неподтверждённые ключи и текстовые
поля чисел не входят в API: mapper выдаёт существующий `WorkflowDefinition`.
Поддержаны шесть видов шагов и источники `input`, `step_output`, `literal`.
Неприменённое переименование, некорректное число или JSON-значение блокируют
отправку и сохраняются в форме до исправления или явного сброса. Структурно
корректный незавершённый граф можно сохранить в editing draft; достижимость,
циклы, переходы и согласованность ссылок проверяются сервером при валидации
черновика. Создание и редактирование процесса не запускают его и не меняют
API, persistence или полномочия runtime.

## 22.4. Выбор конфигурации для чата

`GET /config/runtime` возвращает `AIChatConfigurationCatalogDTO`:
nullable `activePointer`, nullable release `{id, version, manifestHash}`
и включённые профили `{key, title, description, locale}`. Для выбора процесса
профиль также содержит `workflows: [{key, title, description}]`
и необязательный `defaultWorkflowKey`; инструкции и граф не выдаются. При отсутствии
активного выпуска chat runtime использует системную конфигурацию.
При наличии выпуска запрос требует точного выбора его профиля. UI показывает
единственный профиль автоматически при первом чтении каталога; несколько
профилей требуют выбора пользователя. Устаревший выбор автоматически не заменяется.

Тело отправки сообщения дополнено необязательным `agentConfiguration`:
`{releaseID, manifestHash, profileKey}`. Browser не передаёт инструкции,
compiled snapshot или trusted policy. Отсутствующий или устаревший выбор
при активном выпуске даёт conflict; несовместимый профиль, неподдержанная
переменная активного шаблона или переполнение renderer дают явную ошибку.
Полный входной выбор входит в request hash. Idempotent retry с тем же телом
возвращает исторический run без повторного чтения active pointer.

Закрытый снимок сохраняется в `runs.turnContext` и передаётся control plane
через серверный transport; публичный `RunDTO.agentConfiguration` содержит
только allowlisted summary из [модели данных](21-ai-plugin-data-model.md#213-снимок-конфигурации-chat-run).
Thread reuse связан с runtime fingerprint конфигурации, модели и server
policy. При несовпадении новый thread получает историю до 32 КиБ UTF-8
как данные. Renderer ограничен 128 КиБ, итоговый JSON prompt/developer
instructions — 256 КиБ UTF-8; превышение не приводит к молчаливому усечению.

## 22.5. Streaming

`GET /runs/:id/events` использует SSE с monotonically ordered event IDs,
reconnect cursor и heartbeat. События содержат bounded typed payload и
redacted evidence references. Потеря соединения не отменяет durable run;
cancel является отдельной idempotent command и не гарантирует откат уже
завершённого side effect.

## 22.6. Запуск и продолжение workflow

`POST /conversations/:id/messages` принимает необязательный `workflow`:
`{key, input?: Record<string, JSONValue>}` рядом с exact `agentConfiguration`.
Это явный выбор включённого процесса выбранного профиля. Без `workflow`
обычный чат сохраняет прежнее поведение; `defaultWorkflowKey` не запускается
автоматически. Server-owned `input.request` берётся из `content`, попытка
переопределить его отклоняется. Все поля workflow selection входят в request hash.
Вложения и project file selections для workflow пока не принимаются;
явный `webSearch` сохраняет существующую read-only политику.

`POST /runs/:id/workflow/continue` требует authenticated same-origin доступ
владельца диалога, включённый runtime, `Idempotency-Key` и strict body:
`{expectedVersion, expectedStepKey, content?}`. Завершённый сегмент с `ready`
продолжается без `content`; `awaiting_input` требует непустой ответ до 8 000
символов. Client не передаёт phase, outputs, snapshot, identity или permissions.
Архивный диалог, неподходящая phase, устаревшие version/step и изменённый
ответ для уже продолженного шага отклоняются. UI показывает отдельную кнопку
продолжения для `ready` и отправляет ответ на `awaiting_input` из обычного composer.

Черновик UI `workflowDraft: {key, inputText, profile?}` переносится между панелью,
страницей и отдельным окном вместе с остальным состоянием чата. `profile`
содержит прежний exact выбор выпуска/профиля, а `inputText` остаётся ограниченным
сырым текстом: незавершённый JSON не теряется при переносе. Это не исполняемый
checkpoint и не API payload; перед отправкой JSON проходит общий strict parser.
При неопределённом результате запроса UI удерживает прежние body и ключ повтора
и запрещает перенос в другое окно или возврат из него с понятным сообщением.
Сначала нужно повторить запрос или подтвердить сохранённое состояние.

Тот же continue endpoint восстанавливает ещё не подтверждённую передачу
существующего сегмента: для `AIRun.status: queued` и checkpoint `phase: running`
принимаются только `expectedVersion` и `expectedStepKey`, без `content`.
«Повторить запуск шага» доступно и после загрузки диалога заново. Этот запрос
передаёт control plane прежний run ID и exact input; дочерний run не создаётся.

Сервер создаёт не больше одного дочернего AIRun на parent: внутренний unique
key выводится из parent ID, а canonical request hash фиксирует точное тело.
Пользовательские idempotency keys не могут занимать внутренний namespace.
Повтор с тем же телом возвращает прежний child; другой ответ даёт conflict.
Создание child, сообщения, checkpoint и dry-run receipt атомарно. Повтор
сохранённого queued segment передаёт control plane тот же run ID и exact input.
Продолжение использует исторический snapshot родителя, не читает новый active
pointer и заново применяет текущие server-side access/tool gates.

Ответ использует существующий envelope `{run, message?}`; `RunDTO.workflow`
содержит только публичную сводку, описанную в [модели данных](21-ai-plugin-data-model.md#2131-workflow-checkpoint).
Существующее `assistant.completed` завершает сегмент AIRun/SSE, а `workflow.phase`
определяет, ожидается ли следующий сегмент, ответ или процесс уже завершён.
Пауза `request_input` не требует открытого SSE и не означает provider failure.
Ответ control plane `404` для уже `running` workflow run сохраняет `run.failed`
и checkpoint `blocked` в Payload. Потерянный provider turn автоматически
не повторяется; completed checkpoints остаются доступны. Отмена не откатывает
сохранённый dry-run и не исполняет data apply.

Strict JSON checkpoint ограничен 128 КиБ UTF-8. Интерпретатор проверяет
непрерывный путь и cumulative `maxSteps`, явно различает missing и `null`,
использует exact own keys либо RFC 6901 JSON Pointer и canonical JSON comparison.
Capability создаёт настоящий preview `catalog.assignCategory.v1` или
`pages.createDraft.v1` и `pages.updateDraft.v1` только при exact разрешённом binding;
check проверяет его фактическое состояние и audit provenance. Возможности,
подтверждения и ограничения [системного runtime](../01-architecture/10-ai-codex-layer-integration.md#108-исполнение-workflow-сегментами)
не заменяются текстом workflow или результатом модели.


## 22.7. Реестр и история запусков процессов

Реализованы authenticated `canUseChat` GET endpoints:

- `/workflow-runs` — одна строка на owned корневой процесс с актуальным
  дочерним сегментом;
- `/workflow-runs/options` — исторические ключи и названия процессов/профилей
  для фильтров, включая отсутствующие в активном выпуске;
- `/workflow-runs/:rootRunID` — полная ограниченная цепочка сегментов, ход
  выполнения, типизированные результаты и актуальные операции данных.

Параметры реестра: `query`, `workflowKey`, `profileKey`, `status`,
`createdFrom`, `createdTo`, `page`, `pageSize`. По умолчанию страница 1 и 25
записей; `pageSize` — от 1 до 50, `page` — до 1 000 000. Поиск ограничен 200
символами и затрагивает идентификатор корня, названия/ключи процесса и профиля,
название диалога; private inputs, outputs и инструкции в поиск не входят.
Даты имеют формат ISO UTC с годом 0001–9999, относятся к созданию корня и задают полуинтервал
`[createdFrom, createdTo)`. Состояния: `queued`, `running`, `ready`,
`awaiting_input`, `completed`, `blocked`, `failed`, `cancelled`. Состояния AIRun
queued/running/failed/cancelled имеют приоритет над workflow phase.
Неизвестные, повторные и некорректные query-параметры отклоняются.

Сначала определяется актуальный сегмент, затем применяются фильтры, подсчёт
и пагинация. Порядок: последнее обновление по убыванию, затем ID корня по
убыванию. Ответ содержит `items`, `page`, `pageSize`, `totalItems`, `totalPages`.
Options принимает обязательный `kind=workflow|profile`, необязательный `query`
и те же параметры пагинации. Варианты принадлежат истории текущего пользователя,
не каталогу активной конфигурации.

Строка реестра содержит `rootRunID`, safe `latestRun`, краткий `conversation`,
состояние, время создания корня/обновления сегмента, число сегментов и `actions`.
Карточка дополнительно содержит `segments`, `steps`, `dataOperations` и
`permissions.canManageData/canManageConfiguration`. Доступ определяется
одновременно владельцами run и conversation. Исторические GET доступны при
выключенном AI; действия карточки недоступны. `canManageData` содержит
эффективное разрешение для этой карточки с учётом флага AI;
`canManageConfiguration` разрешает просмотр исторической конфигурации.

История строится из существующих PostgreSQL AIRun и exact configuration
snapshots без новой таблицы, поля или второго источника состояния. Поиск
child использует существующий unique `idempotency_key` вида
`workflow:child:<parentRunID>` и сверяет связи корня/родителя/владельца.
Цепочка ограничена 64 сегментами; превышение и повреждённая связь не усекутся
молча. Она не зависит от ограничения истории чата на 100 runs/200 messages.

Результат шага имеет явную форму: redacted текст до 8000 символов с признаком
усечения, результат условия, receipt возможности, результат проверки либо
исход завершения. Raw JSON inputs/outputs, шаблоны и полный snapshot не
выдаются. Времена относятся к сегментам; точные времена серверных pure steps
не восстанавливаются из предположений. Операции данных читаются по owned IDs
и подтверждённому workflow audit; показывается их актуальное состояние,
включая подтверждённые, применённые, отклонённые и истёкшие операции.

Действия используют существующие `/runs/:id/workflow/continue`, cancel,
DataOperation и SSE endpoints. Доступность в DTO — подсказка UI; mutation
повторно проверяет права, текущую версию и hash. Отмена доступна для активного
AIRun, а ready/awaiting_input продолжаются существующей командой. GET истории
не запускает модель и не переключает активный выпуск.

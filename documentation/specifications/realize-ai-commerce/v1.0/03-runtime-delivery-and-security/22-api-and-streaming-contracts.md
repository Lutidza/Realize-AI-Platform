# 22. API и streaming contracts

- **Статус:** target specification
- **Дата сверки реализации:** 4 октября 2026 года (PLAT-03, §22.8)

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
Lane поддерживает `catalog.assignCategory.v1`, `pages.createDraft.v1`,
`pages.updateDraft.v1` и `pages.updateStructureDraft.v1`.

### Готовность ответа к оформлению плана кода

`MessageDTO.changePlan` передаёт вычисленную сервером готовность сохранённого
ответа к `POST /conversations/:id/changes`:

| `status`              | `reason`                             | Поведение интерфейса                       |
| --------------------- | ------------------------------------ | ------------------------------------------ |
| `ready`               | —                                    | Доступно «Оформить план изменения»         |
| `needs_clarification` | `missing_paths` или `too_short`      | Пояснение и «Уточнить изменение»           |
| `unavailable`         | `data_operation` или `not_assistant` | Действия оформления плана кода отсутствуют |

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
отсутствующую операцию; для кода просит явный блок плана с точными файлами и
описанием изменений, а также проверки. В ответе без
`changePlan` оформление скрыто. После завершения SSE повторный GET detail
возвращает ту же проекцию, что загрузка истории; новая схема хранения не нужна.

Writable scope извлекается только из одного полного fenced блока
`realize-code-plan`; пример внутри другого code fence не считается таким блоком.
Проза, ссылки на исходники и сообщения об ошибке не
становятся разрешением менять упомянутые файлы. Формат блока:

````text
```realize-code-plan
{"version":"1.0","files":[{"path":"README.md","change":"Уточнить описание запуска проекта."}]}
```
````

Допустимы только поля `version` и `files`, у записи — `path` и `change`.
Версия строго `1.0`; от 1 до 100 файлов, путь до 240 символов, непустое описание
после trim до 2 000 символов, весь блок до 256 КиБ UTF-8. Путь обозначает
точный относительный файл. Начальное `./` нормализуется; поддерживаются Next
segments `(group)`, `[slug]`, `[...slug]`, `[[...slug]]` и `@slot`, файлы с
расширением и extensionless `Dockerfile`, `Makefile`, `LICENSE`.
Абсолютные пути, URL, traversal, обратные слеши, glob, завершающий `/`, Markdown,
query/hash и суффиксы строк не принимаются. Повтор нормализованного пути,
несколько блоков, неизвестные поля, повреждённый JSON или превышение лимита
отклоняют весь scope без усечения и извлечения путей из окружающего текста.

`missing_paths` означает отсутствие валидного явного scope, даже если текст
содержит имена файлов. Инструкции модели требуют готовить блок только после
проверки файлов и описывать риски и проверки отдельно. Синтаксическая готовность
не доказывает корректность предложенных изменений: protected paths, approvals
и проверки исполнения остаются отдельными ограничениями. Ранее сохранённый
Change Request возвращается повторно до разбора ответа; его scope, hashes и
подтверждения не пересчитываются новым parser.

### Операции данных и черновик страницы

Операции используют существующие endpoints; отдельный произвольный Pages
CRUD для модели не открывается. Пути ниже относительны к `/api/realize-ai`:

| Действие                        | Endpoint                                                  | Strict request body                                  |
| ------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Подготовить dry-run             | `POST /conversations/:id/data-operations`                 | `{sourceMessageID}`                                  |
| Прочитать операцию              | `GET /data-operations/:id`                                | —                                                    |
| Подтвердить или отклонить       | `POST /data-operations/:id/approve`, `/reject`            | `{expectedVersion, expectedOperationHash, comment?}` |
| Применить                       | `POST /data-operations/:id/apply`                         | `{expectedVersion, expectedOperationHash}`           |
| Подтвердить или выполнить откат | `POST /data-operations/:id/approve-rollback`, `/rollback` | `{expectedVersion, expectedRollbackHash, comment?}`  |

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
- после apply — `result: {page: {id, title, slug}, adminUrl, frontendPreviewUrl}`. Ссылка редактора строится
  сервером из настроенного маршрута Admin. После успешного отката результат
  удалённого черновика в DTO отсутствует.

`expectedTargetUpdatedAt` принадлежит веткам изменения существующего документа:
до создания страницы такой версии нет. После apply меняется `rollbackHash`,
который связывает отдельное решение об удалении с ID, версией и fingerprint
созданного черновика. Закрытые snapshot, Lexical/Content schema, пользовательские
документы за границу DTO не выдаются; read-контекст update передаёт только opaque fingerprint.

В UI страницы доступны последовательные действия «Подготовить изменение
данных», «Подтвердить создание», «Создать черновик», затем «Посмотреть в админке»
и «Посмотреть на фронте».
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
fields: [{path, label, value, maxLength}], knowledge?}`. Обе операции требуют текущую
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
`result: {page, adminUrl, frontendPreviewUrl}`. Общие approval/apply/rollback endpoints сохраняются.
В интерфейсе — полный diff, «Подтвердить изменения», «Сохранить черновик» и
отдельное восстановление предыдущего текста. Это не публикация и не удаление
страницы. Все пределы и проверки исходной версии описаны в
[Data/Config Pipeline](../02-change-engine-and-pipelines/14-data-config-pipeline.md#146-редактирование-текста-существующей-страницы).

### Изменение размещения Content

`DataOperationDTO.kind: "pages.updateStructureDraft.v1"` использует те же
prepare/approve/apply/approve-rollback/rollback маршруты. Source — сохранённый
assistant response и предшествующий запрос пользователя того же run. Структурный
intent и полное содержание snapshot из браузера endpoint не принимает.

Preview содержит `{page,status:"draft",action,blockID,beforeIndex,afterIndex,
totalBefore,totalAfter,beforeBlockID,content?}`. Индексы с нуля, отсутствующая
позиция равна null. `content` обязателен для insert/remove и содержит полные
`columns:[{size,text}]` и необязательный `blockName`; у move он отсутствует.
Для insert/move `beforeBlockID:null` означает конец; у remove это поле всегда
равно null. Действие и позиции проверяются согласованно.
После применения возвращается `{page,adminUrl,frontendPreviewUrl}` без raw snapshots.
Подробные входы, bounds, same-run provenance и ограничения —
[структурный контракт](../02-change-engine-and-pipelines/14-data-config-pipeline.md#1411-структурное-редактирование-content).

### Штатный Live Preview Pages

Визуальное отображение использует обычный редактор Payload и его Live Preview.
AI API не выдаёт отдельный визуальный preview или допуск к renderer. Native
admin.preview/livePreview, вход /next/preview и текущая сессия остаются владельцами
просмотра. Карточка публикационного плана содержит top-level adminUrl обычного
редактора; он вычисляется сервером из config.routes.admin и page ID. Пара кнопок
«Посмотреть в админке» и «Посмотреть на фронте» видна непосредственно в карточке.

`frontendPreviewUrl` в результате сохранения draft и на верхнем уровне
публикационного DTO указывает на `GET /data-operations/:id/open-page` под текущим
config.routes.api и plugin prefix `/realize-ai`. Этот endpoint проверяет chat
access, владельца операции и текущий Pages read ACL, читает сохранённый draft и
вызывает существующий `Pages.admin.preview`. Ответ — перенаправление на штатный
внутренний URL с `Cache-Control: no-store` и `Referrer-Policy: no-referrer`.
Вход не создаёт токены, не включает draftMode, не меняет страницу или подтверждение.
Для неподдерживаемой операции, отсутствующей страницы или настройки preview
переход отклоняется. Он доступен при выключенном AI с сохранением обычных прав.
Ссылки вычисляются при projection; сохранённые snapshots и hashes не меняются.

Контракт и связь с выбранной версией — [штатный Live Preview](../02-change-engine-and-pipelines/14-data-config-pipeline.md#1412-штатный-live-preview-payload).

### Публикация и восстановление Pages

- `POST /data-operations/:sourceID/page-publication` принимает
  `{expectedVersion,expectedOperationHash}` и создаёт отдельную
  `pages.publishDraft.v1` из выбранного сохранённого draft.
- `POST /data-operations/:publicationID/page-publication-restore` принимает
  `{expectedVersion,expectedOperationHash}` и создаёт отдельную
  `pages.restorePublication.v1`, сохраняя текущий рабочий draft.
- `POST /data-operations/:id/page-publication-delivery` с тем же CAS повторяет
  только обновление витрины для выполненной публикационной операции.

Все три записи требуют idempotency key и текущую сессию/права. Первые два endpoint
возвращают HTTP 201 и новый DataOperationDTO с другим ID; retry того же key/body
возвращает ту же операцию. Delivery возвращает HTTP 200 и DTO исходной операции.
Новые kinds имеют R2; rollbackStrategy — `restore-publication` и `none`
соответственно. Generic draft rollback этих kinds запрещён.

Public `preview` содержит `{page,sourceOperationID,manifestHash,policyHash,checks,
before:{status,page},after:{status,page}}`, где status — `published|unpublished`.
Снимки страниц публичным DTO не возвращаются. Top-level adminUrl и frontendPreviewUrl
доступны и до применения операции; native preview URL с секретом через DTO не выдаётся. При применении
`result:{page,adminUrl,publicUrl?,delivery}` содержит delivery
`{status:pending|succeeded|failed,message?,deliveredAt?}`. Сбой доставки не
заменяет applied на apply_failed и не разрешает повторную публикацию.

Пользователь просматривает страницу в штатном Live Preview после подготовки
плана. Подтверждение публикации использует обычный `/approve`, дополненный
`previewReview:{manifestHash,desktop:true,mobile:true,noErrors:true}`.
Все флаги обязательны; actor и время назначает сервер. Approval DTO получает
`previewEvidence:{version:"1.0",reviewedAt,...previewReview}`. Это свидетельство
пользователя о просмотре, а не автоматический browser PASS. Restore использует
обычный `/approve` без previewReview. Применение обоих kinds — существующий
`/apply` с ожидаемыми version/hash; callback доставки вызывается после commit.

Пропущенное свидетельство/некорректный ввод дают 400, отсутствие сессии — 401,
недостаточные права — 403, чужая операция скрыта как 404; stale/version/manifest/
policy/expiry дают 409. UI закрывает старые действия после 409 для конкретного
id/version/hash; сервер перепроверяет условия независимо от состояния клиента.
Подробности — [14.13](../02-change-engine-and-pipelines/14-data-config-pipeline.md#1413-публикация-и-восстановление-публичной-версии-pages).

### Каталог и порционное чтение структуры страницы

`GET /chat/page-artifacts` возвращает `PageArtifactCatalogDTO` версии `1.0`:
`{version, hash, definitions}` для Pages, Content и FormBlock. Определение
содержит ID/version, kind, назначение, ссылки schema/renderer, краткий guide,
summary фактических полей и `supportedOperations` с exact capability versions.
Поддержка реализацией не является разрешением на действие. Предел — 32 КиБ.
Определения и guides Pages/Content имеют версию `1.1`, FormBlock — `1.0`;
версии DTO каталога и knowledge остаются `1.0`.

`GET /chat/page-drafts/:id/structure?offset=0` возвращает
`PageStructureContextDTO`: `{page, updatedAt, fingerprint, knowledge}`.
`knowledge` содержит `{version: "1.0", pageID, fingerprint, catalogHash,
definitions, outline: {offset, limit: 32, totalBlocks, nextOffset, blocks}}`.
Следующая порция запрашивается с `offset=nextOffset`, `fingerprint` и
`catalogHash` предыдущего ответа. Продолжение без обеих привязок —
`INVALID_REQUEST`; изменившаяся страница или схема — `CONFLICT`. Неизвестные
query-параметры отклоняются. Максимум 10 000 размещений и 48 КиБ на knowledge.

Размещение содержит `{id, identity, index, path, blockType, definitionID,
settings, references}`. `identity` — `stable`, `missing` или `duplicate`;
без сохранённого ID возвращается `null`. Ссылка FormBlock содержит только
`{field: "form", collection: "forms", id, access}`: readable либо unavailable
с `id: null`. Проверяются текущие права чтения формы, её данные не выдаются.
Структура не является writable Payload patch.

Обе операции требуют сессию чата, `canManageData`, включённого агента и
подключённого host knowledge adapter; чтение структуры дополнительно проходит
прежний Pages update ACL. Ответы `no-store`. Отдельное пользовательское
разрешение чтения пока не введено.
Опциональное `knowledge` в старом текстовом ответе связано с теми же pageID и
fingerprint; сервер передаёт его control plane, а browser не может прислать
свой snapshot. Старые 128 полей / 64 КиБ и write hashes сохраняются отдельно.
Ограничения первого среза описаны в
[контракте каталога и структуры](../02-change-engine-and-pipelines/14-data-config-pipeline.md#149-каталог-и-структура-pages-первый-реализованный-срез).

### Самостоятельный поиск страниц: закрытый callback

`POST /chat/page-tools/:runID` обслуживает только server-to-server вызовы
зарегистрированных `pages_search`, `pages_read`, `pages_structure`. Тело —
strict `PageDiscoveryCall`: `{callID, name, arguments}`. У поиска arguments
содержат `query` и необязательную `page`; у чтения — `pageID`; у структуры —
`pageID` и необязательные `offset`, `fingerprint`, `catalogHash` по прежнему
контракту порций. Чужие поля и имена отклоняются. Endpoint не является
универсальным Payload API или MCP transport.

Авторизация — `Authorization: Bearer <run grant>`: HMAC с отдельным domain
prefix, подписанный существующим control-plane token, сроком ровно 15 минут
и привязкой к runID/userID. URL строится из serverURL и настроенных API routes
установки; browser, модель и HTTP Host не задают callback target. URL и token
передаются только через закрытый `pageDiscovery` серверного запроса к control
plane и не входят в публичный chat DTO, prompt или SSE. Relay запрещает
redirect, ограничивает ответ до 128 КиБ перед JSON parsing и использует
timeout 15 секунд; upstream credentials и raw ошибки модели не раскрываются.

Payload восстанавливает текущего actor, проверяет интеграцию, chat/data access,
владельца активного диалога и run; control plane должен подтверждать running.
Доступ к Pages и forms проверяют существующие сервисы с actor request.
Поиск возвращает `PageDiscoverySearchDTO`: прежний каталог по 20 записей плюс
`adminUrl` у каждой страницы. Остальные результаты — `PageDraftContextDTO` и
`PageStructureContextDTO`. Все ответы используют прежний success/error envelope,
без raw Payload documents.

В `turnContext` сохраняются до 12 вызовов, до трёх текстовых снимков и до восьми
порций структуры. Общий предел двух массивов снимков — 384 КиБ; они не выдаются
в RunDTO. Бюджет резервируется под блокировкой run до чтения; ошибки его не
возвращают. Exact replay `pages_read` возвращает сохранённый снимок после
повторной проверки текущего доступа, а поиск перечитывается. Другие arguments
с прежним callID, повтор pending и повтор failed отклоняются.
Текстовый снимок текущего run допускается к `pages.updateDraft.v1`
только после completed чтения и exact сверки полей. Порция структуры хранит
также проверенные arguments, callID и requestHash; она может подтвердить stable
ID цели/якоря для отдельной `pages.updateStructureDraft.v1`. Повтор порции
требует совпадения текущей ревизии/каталога и проверенного доступа к ссылкам.
Истёкший/некорректный grant — 401, отзыв доступа — 403, конфликт run, callID или
ревизии — 409, исчерпание бюджета — 429. Допуск не предоставляет права записи,
подтверждения или публикации. Подробная семантика повторов и ограничений —
[самостоятельный поиск страниц](../02-change-engine-and-pipelines/14-data-config-pipeline.md#1410-самостоятельный-поиск-и-чтение-страниц).

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
policy. С tools поиска страниц thread всегда новый; при смене fingerprint
он также не переиспользуется. Новый thread получает историю до 32 КиБ UTF-8
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

## 22.8. Exact system policy в серверном transport

Срез PLAT-03 (4 октября 2026) требует `systemRelease: {releaseID, manifestHash}`
в закрытом `POST /v1/runs` control-plane transport. Browser по-прежнему передаёт
только выбор admin release/profile; произвольные системные инструкции, release
artifact и capability grants из browser не принимаются. Web сохраняет reference
в run до dispatch; workflow передаёт сохранённую пару при continuation/retry.
CP проверяет registry, форму/hashes overlay и его capability/check ceiling.
Run-ID replay учитывает system reference как часть полного запроса.

`POST /conversations/:id/changes` сохраняет policy исходного завершённого run.
Plan approval и очередь исполнения требуют этот binding. Несовместимый или
неизвестный сохранённый system snapshot возвращает `409 CONFLICT` с предложением
создать новый запуск/план; legacy записи остаются читаемыми. Browser bodies
create/approve/execute не получают поля для самостоятельного назначения policy.

Формат overlay snapshot остаётся `1.0`. Новое поле server transport требует
согласованного обновления web, CP и worker. Это не endpoint публикации system
release и не новый Admin permission: публикацию выполняет владелец сборки.

## 22.9. Расходы и бюджеты PLAT-04

Префикс `/api/realize-ai`; история доступна и при выключенном AI runtime.

| Метод и путь                     | Право                  | Результат                                                               |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `GET /usage`                     | `canViewUsage`         | Своя клиентская DTO, агрегаты, cursor и customer budgets                |
| `POST /usage/budget`             | `canViewUsage`         | Только customer budget своей установки/project/purpose                  |
| `GET /usage/platform`            | `canViewPlatformUsage` | Owner DTO с себестоимостью, provenance и последними тарифами            |
| `POST /usage/platform/budget`    | `canViewPlatformUsage` | Owner model budget с CAS                                                |
| `POST /usage/platform/prices`    | `canViewPlatformUsage` | Новая последовательная revision immutable тарифа                        |
| `POST /usage/platform/reconcile` | `canViewPlatformUsage` | Корректирующее evidence полной стоимости одной оси                      |
| `POST /usage/platform/abandon`   | `canViewPlatformUsage` | Явно подтверждённая остановка зависшего учёта, без освобождения резерва |

GET принимает строгий bounded query: `days` (1–366), `before`, `model`, `source`,
`workflowKey`, `agentProfileKey`, `outcome`. Owner дополнительно использует
`installationId`, `projectId`, `purpose`, `systemReleaseId`, `overlayReleaseId`,
`modelCatalogRevision`, `routerPolicyVersion`. Клиентский override scope и
owner-only filters отклоняются, повторные/неизвестные параметры недопустимы.
Среднее по подтверждённым preview использует собственный полный task scope,
описанный в [observability](../04-commercial-and-operations/28-observability.md#285-административная-аналитика-plat-04).

POST требует `Idempotency-Key`, bounded JSON и повторную серверную авторизацию.
Денежные суммы/ставки — целые nanos в строке; неизвестное значение — `null`.
Budget/reconciliation/recovery требуют expected revision, конфликт — `409`.
Сервер назначает event/pricing ID и digest; UI не передаёт raw Payload records.
Ошибки доступа — `401/403`, невалидный query — `400`, недоступная БД — `503`.

Внутреннее событие адаптера `usage.measured` не является публичным SSE-событием.
Metering сохраняет его напрямую, не полагаясь на eventPersistence браузерного
stream. Внешнего client endpoint для произвольного импорта финансовых events нет.

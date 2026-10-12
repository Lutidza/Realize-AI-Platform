# Миграции и rollback

- **Статус:** current implementation runbook
- **Дата сверки:** 12 октября 2026 года (Task Manager и source appearance state/replay schema)

## 1. Канонический порядок миграций

В `src/migrations/**` находятся:

1. `20260817_124443_baseline_core_schema` — baseline активной Payload schema;
2. `20260817_124449_realize_ai_readonly` — четыре коллекции read-only AI slice;
3. `20260817_135658_conversation_idempotency` — idempotent conversation create
   с backfill `legacy:<id>` для уже существующих диалогов;
4. `20260818_170919_approval_only_change_requests` — Change Requests и точные
   plan approvals;
5. `20260821_194623_isolated_execution_worker` — execution queue, check
   evidence и implementation acceptance;
6. `20260821_205949_local_preview_promotion` — deployments, promotion stages,
   preview checks и preview acceptance;
7. `20260822_092506_release_candidate_approval` — Release Candidate,
   immutable evidence и release decisions;
8. `20260827_070003_admin_integration_registry` — provider-neutral
   integrations, encrypted credentials и audit;
9. `20260828_022809_github_pull_request_source_promotion` — durable source
   promotion и draft Pull Request evidence;
10. `20260828_044410_data_operation_lane` — approval-gated catalog Data Lane,
    operation events и rollback decisions;
11. `20260901_163832_ai_config_persistence` — hidden installation config drafts,
    immutable releases, active pointer history и durable replay events;
12. `20260909_190959_chat_message_context` — приватные метаданные вложений,
    контекст и источники сообщений, хеш полного запроса запуска;
13. `20260910_122259_ai_config_activation` — значения `config_activated`
    и `config_rolled_back` в enum действий конфигурации;
14. `20260911_132139_worker_presence` — служебное состояние исполнителей,
    время heartbeat, доступные этапы и ссылка на текущее задание;
15. `20260911_155718_page_draft_data_operation` — операция создания черновика
    страницы, её стратегия отката и закрытый снимок созданного документа;
16. `20260912_111003_page_draft_update` — значение `pages.updateDraft.v1`
    для изменения текста существующего черновика;
17. `20260913_184706_page_structure_draft_operation` — значение
    `pages.updateStructureDraft.v1` для структурных операций над черновиком.
18. `20260914_083749_page_publication_operations` — публикация и восстановление
    публичной версии Pages, подтверждение просмотра и доставка обновления витрины.
19. `20260915_080818_media_processing_profiles` — профили с native versions,
    приватные исходники, наборы, варианты и native Payload Jobs.
20. `20260915_082031_media_nullable_backlinks` — nullable обратные связи Media
    для штатного удаления с очисткой файлов в `afterDelete`.
21. `20260923_120805_internal_mcp` — приватные inbound clients, runtime receipts,
    audit actions и связи native locks для управления MCP.
22. `20260925_093817_chatgpt_tunnel_status` — nullable JSON наблюдения ChatGPT
    в существующем runtime receipt; клиентские credentials остаются в vault.
23. `20260925_133735_design_workshop` — четыре закрытые коллекции проектов,
    immutable snapshots, prepared changes и idempotency receipts; применена
    в работающей локальной установке 25 сентября 2026 года.
24. `20260925_170325_design_preview` — закрытая очередь capture jobs, lease,
    evidence и PNG; проверена только на отдельной БД, в основной ещё pending.
25. `20260926_112722_workshop_mcp` — канал MCP и авторизация preview Мастерской.
26. `20260927_070914_search_observations` — закрытая временная диагностика поиска;
    `up`, защищённый `down` и восстановление проверены на отдельной БД;
    применена в локальной установке 27 сентября 2026 года.
27. `20260928_102009_search_observation_state` — закрытые настройки хранения,
    durable cutoff очистки, heartbeat и bounded журнал операций; проверена
    полная fixture цепочка, CAS/конкуренция и защищённый `down`/`up`; применена
    в локальной установке 28 сентября 2026 года.

28. `20261004_161914_ai_execution_context` — private nullable snapshots для CR/job.
29. `20261004_210727_ai_usage_ledger` — пять закрытых таблиц учёта расходов,
    immutable events/prices и защищённый rollback.
30. `20261011_162630_task_manager_foundation` — Project/List/Task, membership,
    immutable task events и actor-bound operation receipts.
31. `20261011_215235_task_git_sync` — immutable Git/PR/CI snapshots для точной
    task revision; отдельный populated rollback guard.
32. `20261012_094626_extension_manager_state` — appearance target state и
    immutable prepare/apply receipt ledger; source migration, к основной
    установке не применена.

В production `push` отключён. Schema меняется только versioned миграциями:

```bash
npm run payload:migrate
npm run payload:migrate:status
```

В пустой PostgreSQL source registry содержит последовательность из 32 миграций.
Для upgrade-сценария третья миграция сначала заполняет legacy-значения,
а затем устанавливает `NOT NULL` и unique index.

Миграция контекста чата добавляет таблицу и nullable-поля; текст сообщения
становится необязательным для отправки изображения без подписи. Откат версии
приложения не требует `down`: он удаляет новый контекст и метаданные вложений.
Перед откатом схемы требуется отдельное решение о сохранении этих данных;
файловый каталог control plane резервируется вместе с БД.

Миграция активации конфигурации только добавляет значения enum; snapshot
chat run использует уже существующее поле `runs.turn_context`. Откат приложения
не требует удаления новых значений. Generated `down` пересоздаёт прежний enum
и несовместим с сохранёнными событиями `config_activated`/`config_rolled_back`.
Перед откатом этой схемы требуется отдельное решение о сохранении audit history;
автоматически удалять события для выполнения `down` нельзя. Rollback выпуска
конфигурации выполняется через active pointer и не является rollback миграции.

Миграция исполнителей создаёт `realize_ai_worker_presence`, enum и индексы.
Она нужна до запуска новой версии worker: без хранилища heartbeat он не
принимает задания. При недоступной таблице API возвращает понятную причину
недоступности исполнителя, сохраняя чтение истории чата. Таблица содержит
операционное состояние, а не аудит или сами задания. Её `down` удаляет только
этот снимок и связанные типы; перед откатом следует остановить новые worker.
Миграция не изменяет очередь и не добавляет автоматический повтор заданий.

Миграция создания страницы расширяет enum `kind` значением
`pages.createDraft.v1` и `rollback_strategy` значением `delete-created-draft`,
добавляет nullable JSON `applied_snapshot` и снимает `NOT NULL` с полей,
относящихся только к товару и категории: `product_id`, `category_id`,
`product_snapshot`, `category_snapshot`, `expected_target_updated_at`.
Существующие операции каталога сохраняют свои значения и hashes; таблицы
`pages` и её версий эта миграция не пересоздаёт. Миграция требуется до
использования нового вида Data Operation.

При сохранённых операциях `pages.createDraft.v1` выполнять её `down` нельзя:
он восстанавливает старые enum и `NOT NULL`, несовместимые с этими записями,
и удаляет `applied_snapshot`, необходимый для проверки отката черновика.
Откат приложения сохраняет расширенную схему и audit history. Старый код
не получает поддержку новых операций от наличия схемы; для завершения или
отката таких операций нужна версия приложения, которая их понимает.
Удалять операции, решения или audit ради успешного `down` запрещено.
Откат отдельного черновика через админку — отдельное подтверждаемое действие
Data Lane, а не откат миграции.

Миграция `20260912_111003_page_draft_update` добавляет только enum kind
`pages.updateDraft.v1`. Таблицы Pages/versions и существующие snapshots
не изменяются. До работы с новым adapter миграция должна быть применена.
При сохранённых update-операциях `down` недопустим: старый enum не принимает
их kind. Откат приложения сохраняет расширенную схему и audit; удалять
операции ради выполнения `down` нельзя.

Миграция `20260913_184706_page_structure_draft_operation` добавляет только
`pages.updateStructureDraft.v1` в enum `kind`. Таблицы Pages/versions,
снимки и существующие операции не изменяются. До создания первой структурной
Data Operation требуется применить миграцию. Откат приложения сохраняет
расширенную схему и историю операций.

Generated `down` возвращает прежний enum в транзакции. Если сохранена хотя бы
одна операция нового kind, PostgreSQL отклоняет приведение значения
(`22P02`); транзакция должна откатиться целиком, сохранив расширенный enum,
операцию и audit. Удалять или переименовывать операции и события для успешного
`down` нельзя. При отсутствии нового kind откат схемы допустим только после
остановки writers и проверенного backup. На отдельной PostgreSQL проверены
полная цепочка из 17 миграций, `up`/`down` без новых операций и отказ `down`
с новой операцией и её событием без изменения схемы и audit.

Миграция `20260914_083749_page_publication_operations` добавляет kinds
`pages.publishDraft.v1` и `pages.restorePublication.v1`, risk level `R2`, стратегии
`restore-publication` и `none`, тип события `publication_delivery_requested`
и delivery status `failed`. Новые nullable-поля — `preview_evidence` в approvals,
`delivery_error` и `delivered_at` в outbox. Existing defaults и данные сохраняются;
таблицы Pages/versions не изменяются. Публикация требует этой миграции до создания
операций новых kinds.

Обычный generated `down` не защищает заполненные nullable-поля от удаления.
Поэтому источник этой миграции — отдельный Payload template
[`scripts/migrations/page-publication-operations.mjs`](../../scripts/migrations/page-publication-operations.mjs).
Он использует реальную sanitized schema и штатный Drizzle generator; TS, JSON
snapshot и index создаются через официальный CLI, без ручного редактирования:

```bash
npm run payload:migrate:create -- page_publication_operations --file "$PWD/scripts/migrations/page-publication-operations.mjs"
npm run payload:generate-types
```

Это команда первоначальной генерации данной миграции, а не шаг её применения.
Template требует последним snapshot `20260913_184706_page_structure_draft_operation.json`
и PostgreSQL adapter. Повторная генерация возможна только вместо собственной
ещё не применённой пары TS/JSON; уже применённую миграцию не удаляют и не
перегенерируют. Для применения готовой цепочки используют `payload:migrate`.

`down` внутри штатной Payload transaction сначала блокирует operations, approvals
и events от конкурирующих writers. До любого cast/drop он отказывает с `P0001`
и `PAGE_PUBLICATION_ROLLBACK_BLOCKED`, если существуют новые kinds, `R2`, новые
стратегии, любой non-null `preview_evidence`, новый тип/статус доставки либо
non-null `delivery_error`/`delivered_at`. Проверка новых полей действует и для
операций старого kind. Нельзя удалять audit, очищать evidence или менять kinds
ради прохождения этой проверки. Откат приложения сохраняет расширенную схему;
восстановление публичной версии — отдельная подтверждаемая операция Pages.

На disposable PostgreSQL проверены полная цепочка из 18 миграций, точное
расширение семи enum-значений и трёх nullable-полей, восстановление схемы пустым
`down` и десять независимых отказов с сохранением схемы, операций, approvals
и events. Перед применением к сохраняемой БД обязательны остановка writers,
private backup `0600`, проверка restore на clone и сверка всех прежних полей
существующих строк; новые nullable-поля должны остаться пустыми.

### Media: схема, удаление и резервное копирование

До запуска Media worker применяются обе миграции Media. Первая добавляет девять
таблиц, три nullable поля Media и связи native locks, сохраняя прежние focalX/Y.
Источник первой миграции —
[media-processing-profiles.mjs](../../scripts/migrations/media-processing-profiles.mjs).
Native generator создаёт SQL/TS/JSON/index. Template упорядочивает снятие FK до
`DROP TABLE CASCADE` и добавляет `MEDIA_PROCESSING_ROLLBACK_BLOCKED`: populated
профили, версии, исходники, результаты или Jobs блокируют разрушительный down.

Вторая миграция снимает `NOT NULL` только с обратных `media_id` в originals/sets.
Native FK выполняет `SET NULL` перед `afterDelete`; сервис затем удаляет связанные
файлы, наборы и задания в той же транзакции. При создании связь обязательна по
валидации сервиса. Проверка занятости выполняется без файловых изменений до
native проверки блокировки редактора. `down` второй миграции возвращает `NOT NULL`
и отказывает при наличии null-связей; удалять данные для обхода отказа нельзя.

Резервная копия работающей медиатеки включает **БД, `public/media` и весь
`MEDIA_PRIVATE_STORAGE_DIR`** (локально `.data/media`, Compose volume
`media-private-data`). Файлы и БД копируются при остановленных writers и Media
worker. Одного SQL dump недостаточно для восстановления изображений. Перед
применением схемы проверяются private dump `0600`, его restore в отдельную БД,
upgrade клона и сохранность прежних строк. Автоматический перенос legacy файлов
или массовая обработка при миграции не выполняются.

Файловые операции native upload/delete не являются транзакцией файловой системы:
авария между записью файла и commit может оставить закрытый orphan. Read-Where
не выдаёт его; автоматическое освобождение orphan storage и проверка облачного
хранилища относятся к следующему эксплуатационному этапу. Откат приложения
сохраняет данные и расширенную схему.

### Мастерская: сохранение версий и receipts

Источник миграции W1a —
[design-workshop.mjs](../../scripts/migrations/design-workshop.mjs).
Она генерируется командой `payload migrate:create design_workshop --file
<абсолютный путь template>` из canonical collections. SQL/schema snapshot,
TS и index создаёт установленный генератор Payload/Drizzle; template проверяет
предшественника и добавочный scope из четырёх таблиц, затем добавляет guard
для down. Эти коллекции не редактируются через native Admin, поэтому
`lockDocuments: false`; сериализацией API управляют транзакционные locks.

Up не меняет существующие строки. Down под exclusive locks разрешён только
при пустых четырёх таблицах; иначе выдаётся `WORKSHOP_ROLLBACK_BLOCKED`.
Откат приложения оставляет расширенную схему и историю; удалять проекты,
версии или receipts ради успешного down нельзя. Бинарных файлов этого
подэтапа нет: backup дизайн-проектов входит в backup PostgreSQL.

Локальное обновление до этой версии проверено восстановлением custom-format
backup на отдельном PostgreSQL и применением единственной pending migration.
На клоне и основной БД сверены прежние поля и строки всех 120 таблиц.
Перед установкой создан свежий backup с mode `0600`, предыдущая сборка сохранена
для application rollback. Основная БД содержит 23 записи migration history;
проверочные пользователи и дизайн-проекты создавались только на клоне.

### Мастерская: очередь sandbox capture

Источник следующей миграции —
[design-preview.mjs](../../scripts/migrations/design-preview.mjs).
Native `payload migrate:create design_preview --file <абсолютный путь template>`
добавляет единственную таблицу `realize_design_preview_jobs`, её enums,
индексы и связь с users. Существующие таблицы и строки не переписываются;
generic CRUD закрыт, `lockDocuments: false`. Job DTO и PNG выдаёт только
авторизованный facade, actor и fencing metadata остаются приватными.

Down под exclusive lock отказывается работать при любом сохранённом задании:
`WORKSHOP_PREVIEW_ROLLBACK_BLOCKED`. Отмена или TTL не разрешают удаление
истории ради rollback; откат приложения сохраняет таблицу. Bounded PNG входят
в backup PostgreSQL, временный sandbox staging не является резервной копией.
Перед обновлением worker применяют миграцию и проверяют Linux prerequisites
из [локального runbook](01-local-admin-ai.md). Старый worker новую очередь
не обслуживает. В отсутствие migration/toolchain новая версия не объявляет
capability `workshopPreview`, API start отвечает unavailable.

Основная установка пока содержит 23 migration records. Проверки очереди
выполняются только на disposable БД с 24 миграциями; поставка в основную
установку и обновление её production bundle в этот срез не входят.

### MCP: сохранение ключей и истории

Добавочная migration `20260925_093817_chatgpt_tunnel_status` создана native
`payload migrate:create` по canonical receipt collection. Up добавляет только
nullable JSON колонку, down удаляет только наблюдение (не keys/config/audit).
При rollback приложения расширенную схему сохраняют; down не требуется.
Encrypted connector keys резервируются вместе с integration registry и отдельно
сохраняемым master key установки.

Источник добавочной MCP миграции —
[internal-mcp.mjs](../../scripts/migrations/internal-mcp.mjs), запускаемый через
`payload migrate:create internal_mcp --file <абсолютный путь template>`.
TS/SQL/snapshot/index создаёт установленный Payload/Drizzle generator.
Существующие GitHub/Codex records сохраняются. Неизвлекаемые verifiers входят
в резервную копию БД вместе с registry и audit; plaintext ключей в БД нет.

Generated down блокируется `MCP_ROLLBACK_BLOCKED`, если имеются MCP clients,
receipts, instance records или audit events. Эти данные нельзя удалять ради
rollback. Откат приложения сохраняет расширенную схему. Empty down/up и отказ
на populated схеме проверены на отдельной PostgreSQL 18.6. Runtime запускается
только после штатного применения миграций и не использует schema push.

24 сентября 2026 года локальная systemd установка обновлена с 20 до 21
миграции: применена только `20260923_120805_internal_mcp`. До применения
проверены восстановление private backup и миграция на отдельной копии БД.
Сравнение всех прежних полей и строк 118 таблиц подтвердило их сохранность
на копии и в локальной установке. Внешний production этим обновлением не затронут.

25 сентября локальная установка обновлена до 22 миграций: после private backup
применена `20260925_093817_chatgpt_tunnel_status`. Проверены upgrade и down/up
нового nullable поля на отдельной БД, production build и браузерный сценарий
на точной standalone-сборке. Ключи и настройки остальных интеграций не менялись.
Предыдущая сборка сохранена для отката приложения без удаления схемы.

## 2. Existing database adoption

Baseline создан из текущей schema. База, которая ранее обновлялась через Payload
schema push, уже может содержать эти таблицы, но не иметь соответствующей записи
в migration history. Прямой запуск baseline тогда завершится конфликтом
`table already exists`.

Owner процедуры — `scripts/migrations/**`. Default-команда не меняет target:

```bash
npm run payload:migrate:adopt:verify
```

Она выполняет полный цикл:

1. создаёт private custom-format backup в
   `.runtime/migration-adoption/backups/**` и проверяет его restore list;
2. восстанавливает backup в отдельную clone-БД;
3. создаёт пустую reference-БД и применяет к ней все миграции из
   `src/migrations/index.ts`;
4. сравнивает semantic PostgreSQL catalog двух БД: таблицы, колонки без
   физического ordinal, enum-порядок, constraints, indexes, sequences,
   extensions, policies, triggers, functions, types и views;
5. заменяет migration history только на clone и проверяет, что штатный
   `payload migrate` после этого является no-op;
6. удаляет обе временные БД. Evidence остаётся в
   `.runtime/migration-adoption/runs/**`, который не попадает в Git.

Adoption fail-closed принимает только одно из двух состояний:

- единственная запись `dev/-1` — требуется adoption;
- полный упорядоченный список named migrations с положительными batch — БД уже
  adopted.

Пустая, частичная, смешанная или неизвестная история останавливает команду.
Инструмент не пытается угадать происхождение schema и не исполняет baseline над
существующими таблицами.

### Применение к target

Перед mutation необходимо остановить web/control-plane и любые другие writes.
`--apply` всегда заново выполняет backup и весь clone/reference proof. Затем он
повторно сравнивает текущую target schema и в одной блокирующей транзакции
заменяет `dev/-1` на named history. Payload schema и пользовательские таблицы
этой транзакцией не меняются.

```bash
REALIZE_MIGRATION_ADOPTION_WRITES_STOPPED=true \
REALIZE_MIGRATION_ADOPTION_CONFIRM=<точное-имя-базы> \
npm run payload:migrate:adopt:apply
```

Оба guard-а обязательны. Если application role не имеет права создавать и
удалять временные БД, отдельно передаётся operator URL:

```bash
MIGRATION_ADOPTION_ADMIN_DATABASE_URI=<operator-postgres-url> \
REALIZE_MIGRATION_ADOPTION_WRITES_STOPPED=true \
REALIZE_MIGRATION_ADOPTION_CONFIRM=<точное-имя-базы> \
npm run payload:migrate:adopt:apply
```

После PASS нужно запустить `npm run payload:migrate:status`, вернуть сервисы и
проверить readiness. Пароли и connection URLs не выводятся в evidence.
При перезапуске adopted database должна использовать `PAYLOAD_DB_PUSH=false`
или отсутствие этой переменной. Иначе Payload development push снова добавит
`dev/-1`, и fail-closed migration history станет mixed.

### Recovery

- ошибка до target transaction не меняет target;
- ошибка внутри history transaction откатывается PostgreSQL;
- verified backup создаётся до каждого apply и является recovery point;
- автоматический full restore не выполняется: после успешного adoption он мог
  бы перезаписать новые данные и требует отдельного решения оператора.

Первичная безопасная процедура остаётся обязательной:

1. остановить writes и сделать проверяемый backup;
2. восстановить backup в отдельную временную PostgreSQL;
3. сравнить фактическую schema с baseline и выполнить migration dry run на
   восстановленной копии;
4. проверить exact history plan;
5. только после recovery proof и explicit approval повторить на target.

Deploy по-прежнему не выполняет adoption автоматически. Если target не adopted,
обычный rollout останавливается до переключения web.

## 3. Backup перед deploy

`remote-deploy.sh` перед миграциями создаёт PostgreSQL custom-format dump:

```text
.release/backups/<release-id>.dump
```

Файл имеет mode `0600`. Retention и перенос backup за пределы одного VPS должны
быть настроены эксплуатацией отдельно.

## 4. Application rollback

Ручной `.github/workflows/rollback.yml` возвращает `.release/previous.env` и
поднимает сохранённый immutable digest. После переключения он снова проверяет
readiness.

Rollback image не откатывает database schema. Каждая migration обязана быть
backward-compatible с предыдущим application digest либо иметь отдельно
проверенный data rollback/restore plan. Автоматический restore dump при failed
readiness намеренно не выполняется, чтобы не перезаписать данные без решения
оператора.

## Диагностика поиска агентов

`20260927_070914_search_observations` добавляет закрытую коллекцию временной
аналитики и её индексы. Источник —
[`search-observations.mjs`](../../scripts/migrations/search-observations.mjs),
TS/JSON/index созданы официальным Payload generator. Применить до запуска
managed MCP и Admin новой версии. `down` блокируется при сохранённых событиях
с `SEARCH_OBSERVATIONS_ROLLBACK_BLOCKED`; удалять данные ради успешного отката
не следует. Контракт и retention:
[архитектура поиска](../architecture/repository-search.md).

27 сентября локальная установка получила только эту независимую миграцию
через `payload.db.migrate({ migrations: [searchMigration] })`: 23 прежних
записи и одна новая, без schema push. Миграции 24–25 Мастерской остаются pending.
Тот же переход с 23 миграций предварительно проверен на отдельной БД.
Это адресная активация диагностики; порядок полного выпуска сохраняется
в `src/migrations/index.ts`.

`20260928_102009_search_observation_state` добавляет только закрытый singleton
управления диагностикой и его связь в `payload_locked_documents_rels`.
Источник — [`search-observation-state.mjs`](../../scripts/migrations/search-observation-state.mjs);
TS/JSON/index и Payload types создаются официальными генераторами. Default
retention/capacity совместимы с прежней версией. Таблица должна существовать до
запуска обновлённых web/control plane/managed MCP. Native migration API допускает
адресное применение этой независимой миграции, сохраняя pending Workshop;
для нового окружения применяется полная цепочка из index.

`down` отказывает с `SEARCH_STATE_ROLLBACK_BLOCKED`, если revision больше 1:
настройки, ручная очистка и её durable cutoff являются сохранёнными решениями.
Откат приложения оставляет таблицу. Не сбрасывать revision и не удалять state
ради успешного rollback. На свежем/default state `down`/`up` допустимы и
проверяются только в disposable БД; события поиска эта миграция не удаляет.

28 сентября выполнен адресный upgrade локальной установки: 24 прежних receipt
сохранены, добавлен один state receipt, история событий не изменилась.
Перед apply создан private PostgreSQL custom dump с mode 0600 вне репозитория,
проверены каталог и полное чтение архива. Переход 24 → 25 через native migration
API предварительно выполнен на отдельной БД; Workshop 24–25 остаются pending.
Полная цепочка 27 миграций также проверена в disposable PostgreSQL.

## Привязка системного и админского AI-снимка

`20261004_161914_ai_execution_context` добавляет nullable `execution_context`
в `realize_ai_change_requests` и `realize_ai_execution_jobs`. Источник —
[`ai-execution-context.mjs`](../../scripts/migrations/ai-execution-context.mjs);
TS/JSON/index и Payload types созданы официальными генераторами. Backfill
текущим release не выполняется: он изменил бы происхождение старых планов.
Старые записи читаются, новое исполнение требует exact сохранённого binding.

`down` блокирует обе таблицы и отказывает с `AI_CONTEXT_ROLLBACK_BLOCKED`, если
хотя бы в одной сохранён non-null snapshot. Откат приложения сохраняет эти поля.
На отдельной PostgreSQL проверены все 28 `up`, nullable upgrade с сохранением
прежних данных, `down/up` без snapshots и независимые отказы rollback для CR/job.

4 октября новая миграция адресно применена к локальной установке через native
Payload migration API: сохранены 25 прежних receipt, добавлен 26-й; обе колонки
проверены. Перед применением создан private custom-format backup вне репозитория,
проверены каталог и полное чтение архива. Добавление nullable-полей совместимо с
существующими writers; их задания не отменялись и не переписывались. Для соединения
миграции заданы lock timeout 5 секунд и statement timeout 30 секунд. Прежние
pending migrations Мастерской этим адресным действием не применялись.

### Расходы ИИ: PLAT-04

Источником новой миграции служит
[`ai-usage-ledger.mjs`](../../scripts/migrations/ai-usage-ledger.mjs). Штатный
Payload generator создаёт TS/JSON и index из schema diff после execution context.
Events и prices защищены от UPDATE/DELETE триггерами; `down` блокирует пять
таблиц и отказывает с `USAGE_LEDGER_ROLLBACK_BLOCKED`, если в них есть данные.
Удалять финансовую историю ради rollback нельзя. Откат приложения сохраняет
расширенную схему; предыдущая версия приложения не обеспечивает новый metering.

`npm run check:usage:postgres` создаёт отдельную PostgreSQL fixture, применяет
все 29 native migrations, проверяет пустой down/up, отказ непустого down,
конкурентные резервы и сверку. Вызов не использует модели и не меняет основную БД.

5 октября ledger migration адресно применена к локальной установке: сохранены
26 прежних receipts, добавлен 27-й. Все 17 execution jobs остались без изменений.
Перед применением создан private custom-format backup вне репозитория, проверены
его целостность и восстановление в отдельную БД; на восстановленной копии успешно
применена новая миграция. Основные credentials и dump в workspace не сохранялись.
Прежние pending migrations Мастерской этим действием не применялись.

До перезапуска web/CP/worker требуется эта схема и совместимая сборка: отсутствие
ledger блокирует новые модельные вызовы. Зависшие финансовые attempts закрывает
владелец после фактической остановки процесса; резерв остаётся до явной сверки.
Операционная семантика и точный охват —
[§25.7](../specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/25-subscriptions-and-ai-billing.md#257-реализованный-локальный-контур-plat-04).

### Task Manager: Foundation и Git-снимки

Schema owners — коллекции `packages/payload-task-manager/src/taskCollections.config.ts`.
Миграции генерируются штатным Payload/Drizzle через
[`task-manager.mjs`](../../scripts/migrations/task-manager.mjs) и
[`task-git-sync.mjs`](../../scripts/migrations/task-git-sync.mjs); generated TS/JSON,
registry и Payload types вручную не исправляются.

Foundation владеет общей `realize_task_history_immutable()`; Git migration
использует её для запрета UPDATE/DELETE снимков. Порядок rollback обратный:
Git-снимки, затем Foundation. Непустой `realize_task_git_syncs` блокирует down
ошибкой `TASK_GIT_ROLLBACK_BLOCKED`; Foundation защищает свои таблицы через
`TASK_ROLLBACK_BLOCKED`. Откат приложения сохраняет историю в расширенной схеме.

`npm run check:tasks:postgres` создаёт собственную одноразовую loopback БД,
применяет 31 миграцию, проверяет пустой down/up, immutable guards, атомарность
sync/receipt, CAS, конкурентные повторы и восстановление после перезапуска.
`npm run check:tasks:browser` использует отдельную browser БД с той же цепочкой.
Обе fixture удаляются владельцем после проверки. Эти команды не применяют
миграции к рабочей установке.

12 октября 2026 года по разрешению пользователя в рабочей локальной БД адресно
применены только `20261011_162630_task_manager_foundation` и
`20261011_215235_task_git_sync` через штатный `payload.db.migrate`. Backup для
этого операционного этапа не создавался по прямому указанию пользователя;
проверка восстановления рабочей БД не заявляется. Прежние 27 migration receipts
сохранены без изменения; после применения их 29. Созданы семь таблиц, одна
trigger function и три immutable triggers. Все шесть попыток UPDATE/DELETE
синтетических записей events/operations/git-syncs отклонены; диагностическая
транзакция полностью откатилась. Проверка SQL guards не является проверкой
авторизованного Task API. `design_preview` и `workshop_mcp` остаются pending.

Контракт API и границы текущего polling —
[Task Manager execution §14](../specifications/task-management-execution.md#14-долговечная-синхронизация-git-по-запросу-2026-10-12).

### Менеджер расширений: appearance state и replay ledger

Schema owner —
[`extensionManagerCollections.config.ts`](../../packages/payload-extension-manager/src/extensionManagerCollections.config.ts),
генератор —
[`extension-manager-state.mjs`](../../scripts/migrations/extension-manager-state.mjs).
Штатный Payload/Drizzle создал source TS/JSON
[`20261012_094626_extension_manager_state`](../../src/migrations/20261012_094626_extension_manager_state.ts):
две таблицы `realize_extension_manager_state`/`realize_extension_manager_receipts`,
enum kind и unique scope/replay indexes. Generated files и types вручную не
редактируются; source generation не выполняет main apply.

State JSON содержит независимые Admin/frontend revisions и pending plans;
`receipts: []` не является очередью или очищаемым журналом. UUID receipt
сохраняется отдельно на срок жизни ledger. SQL function
`realize_extension_receipts_immutable()` отклоняет UPDATE/DELETE receipts;
Payload hooks защищают тот же контракт даже при Local API overrideAccess.
`down` под ACCESS EXCLUSIVE lock проверяет обе таблицы и отказывает при любых
rows с `EXTENSION_ROLLBACK_BLOCKED`. Удалять state/историю ради обхода guard нельзя.
Application rollback сохраняет расширенную схему; recover назначения выполняется
через prepare/preview/apply, а не через migration down.

[`verifyExtensionManager.controller.mjs`](../../scripts/runtime/verifyExtensionManager.controller.mjs)
создаёт собственную loopback `realize_extension_fixture_*` БД через служебную
`/postgres`, запускает
[`extension-appearance-postgres.int.spec.ts`](../../tests/int/extension-appearance-postgres.int.spec.ts)
и удаляет только созданную fixture в `finally`. Проверено 13 tests: exact
source up/down/up, real Payload transactions/Local API, concurrent CAS/replay,
258 durable receipts, bounded history32, callback/SQL failure rollback, immutable
hooks/SQL и populated down refusal. После проверки fixture databases: 0.
Расширение shell lifecycle использует те же таблицы с scope `${scopeKey}:admin-shell`
и собственным строгим codec. Legacy appearance JSON и ledger не мигрируются.
Generic kernel дополнительно проверен на атомарной dependency/CAS, replay без
чтения повреждённого appearance и независимом native выборе: 17 tests прошли.
Это проверка source migration и persistence, не production acceptance.

Миграция к рабочей БД не применена; main migration receipts и deployment
не менялись. До разрешённого применения source API показывает `requires_schema`
и блокирует запись с `SCHEMA_REQUIRED`, а System Admin SSR использует проверенное
начальное compiled назначение. Иные SQL ошибки и повреждённый JSON завершаются
безопасным отказом. Schema push, автоматический apply из HTTP и операция
установки нового package этим этапом не предоставлены. Контракт —
[менеджер расширений](../specifications/extension-management.md#state-immutable-ledger-и-атомарность).

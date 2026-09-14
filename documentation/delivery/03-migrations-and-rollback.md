# Миграции и rollback

- **Статус:** current implementation runbook
- **Дата сверки:** 14 сентября 2026 года

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

В production `push` отключён. Schema меняется только versioned миграциями:

```bash
npm run payload:migrate
npm run payload:migrate:status
```

На пустой PostgreSQL все восемнадцать миграций должны применяться по порядку.
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

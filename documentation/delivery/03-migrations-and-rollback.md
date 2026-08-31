# Миграции и rollback

- **Статус:** current implementation runbook
- **Дата сверки:** 28 августа 2026 года

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
    operation events и rollback decisions.

В production `push` отключён. Schema меняется только versioned миграциями:

```bash
npm run payload:migrate
npm run payload:migrate:status
```

На пустой PostgreSQL все десять миграций должны применяться по порядку.
Для upgrade-сценария третья миграция сначала заполняет legacy-значения,
а затем устанавливает `NOT NULL` и unique index.

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

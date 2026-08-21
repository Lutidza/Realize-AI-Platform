# Отчёт migration adoption

- Дата: 2026-08-17
- Target: local PostgreSQL database `realize_ecommerce`
- Статус: `TARGET APPLIED AND RUNTIME VERIFIED`

## 1. Исходное состояние

Текущая БД была создана Payload development schema push и содержит реальные
локальные данные. Migration history состоит из единственной записи `dev/-1`.
Прямой `payload migrate` предлагает удалить dev schema и применить baseline,
поэтому такой запуск был остановлен без подтверждения и без изменения БД.

Перед проверкой зафиксированы, среди прочего:

- 91 таблица public schema;
- 769 колонок;
- 437 индексов;
- 233 constraints;
- 1 пользователь, 2 страницы и 8 товаров;
- 1 AI conversation, 6 сообщений, 3 run и 833 run events.

## 2. Реализованный owner

- `scripts/migrations/adopt-schema-push.mjs` — orchestration и explicit apply
  guards;
- `scripts/migrations/schema-evidence.mjs` — semantic catalog snapshot;
- `scripts/migrations/migration-history.mjs` — fail-closed plan и locked
  transaction;
- `scripts/migrations/postgres-runtime.mjs` — exact temporary database
  lifecycle;
- `scripts/migrations/command-runner.mjs` — bounded child processes и
  redaction;
- `tests/int/migration-adoption.int.spec.ts` — pure contract checks.

Default-команда `npm run payload:migrate:adopt:verify` никогда не меняет
migration history target. Apply требует одновременно `--apply`, exact database
confirmation и декларацию остановленных writes.

## 3. Воспроизводимое evidence

Успешный apply-прогон: `20260817152941_9ff501`.

| Evidence | Результат |
| --- | --- |
| Custom-format backup | `.runtime/migration-adoption/backups/realize_ecommerce-20260817152941_9ff501.dump`, 446527 bytes, mode `0600` |
| Backup SHA-256 | `51eba8d615c4aca784a86f73849ec044d03b3d1d44c1f59ccb40ce3b378049e2` |
| Restore list | 1042 entries, включая `payload_migrations` |
| Restore в clone | PASS |
| Все 3 named migrations на пустой reference | PASS |
| Semantic schema equality | PASS |
| Semantic schema SHA-256 | `6a67c43b6da5051a2b05938cf4dbf948e3e5e96b4c53c1509e603af83f1c6eff` с обеих сторон |
| Clone history transaction | PASS: `dev/-1` заменён тремя named rows batch `1` |
| Штатный `payload migrate` после adoption | PASS: history и schema не изменились |
| Target transaction | PASS: `dev/-1` заменён тремя named rows batch `1` |
| `payload migrate:status` | PASS: все три migration имеют `Ran=Yes` |
| Cleanup | PASS: обе probe-БД apply-прогона удалены |
| Target mutation | APPLIED: только migration metadata, без schema/user-data changes |

Сравнение охватило одинаковые с обеих сторон 91 таблицу, 769 колонок, 57 enum
types с 174 ordered labels, 233 constraints, 437 indexes, 56 sequences и одну
extension. Functions, policies, triggers, custom domain/range types и views в
public schema отсутствуют с обеих сторон.

Отдельный raw `pg_dump --schema-only` probe дал единственный структурный diff:
`realize_ai_conversations.idempotency_key` физически расположен раньше в
schema-push БД и в конце таблицы в migration reference, потому что третья
migration добавляет колонку через `ALTER TABLE`. Тип, nullability, unique index
и все constraints совпадают. Physical column ordinal не является контрактом
PostgreSQL/Payload и поэтому намеренно исключён из semantic comparison.

## 4. Fail-closed границы

Adoption разрешён только для exact `dev/-1` или уже полного named history.
Partial/mixed/empty history, schema drift, отсутствующий backup entry, ошибка
restore, failed migration или изменившийся target schema останавливают процесс.
Временные БД можно удалить только в namespace
`realize_adopt_(clone|ref)_<timestamp>_<random>`.

Скрипт меняет только строки `payload_migrations` в одной транзакции под table и
advisory lock. Он не исполняет baseline над target, не меняет Payload schema и
не трогает пользовательские таблицы.

## 5. Post-apply runtime verification

Первый restart после успешной transaction обнаружил config drift:
`src/payload.config.ts` включал Payload schema push для любого development
запуска. Payload добавил `dev/-1` рядом с named history, хотя schema и
пользовательские данные не изменились.

Web был немедленно остановлен. После exact-history check одна новая строка
`dev/-1` удалена в транзакции. Migration policy исправлена: schema push теперь
требует явного `PAYLOAD_DB_PUSH=true` и допустим только для disposable local DB;
по умолчанию development также migration-only.

Повторный полный restart подтвердил:

- liveness `ok`, readiness `database=ok, payload=ok`;
- Payload Admin login HTTP `200`;
- authenticated control-plane status `ready`;
- `dev/-1` count `0` после инициализации Payload;
- все три named migrations остаются batch `1` и `Ran=Yes`;
- row counts до и после совпадают: users `1`, pages `2`, products `8`,
  conversations `1`, messages `6`, runs `3`, events `833`.

## 6. Текущее состояние

Local database полностью adopted. Web и AI control-plane снова запущены. Новые
schema changes должны оформляться versioned migrations; обычные
`payload migrate` и `payload migrate:status` теперь безопасно используют named
history.

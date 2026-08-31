# 16. Mixed change pipeline

- **Статус:** target specification

Mixed Change объединяет связанные data, schema, code, configuration и release
операции в один parent Change Request.

## 16.1. План

Parent фиксирует dependency graph, общий risk, target state и acceptance.
Каждый subplan имеет собственный capability descriptor, executor, checks,
artifact hash и rollback strategy.

Типичный порядок:

1. backward-compatible schema/code preparation;
2. migration и controlled backfill;
3. content/data/config mutation;
4. build и isolated preview;
5. единое acceptance целевого результата;
6. release и отдельно production authorization;
7. cleanup устаревшей schema только в последующем совместимом release.

## 16.2. Атомарность

Одна PostgreSQL transaction допустима только внутри одного data boundary.
Нельзя притворяться, что Git, database, external API и deployment составляют
общую транзакцию. Для распределённого изменения используется saga: durable
states, idempotency keys, compensating actions и explicit partial-failure
handling.

## 16.3. Failure policy

Ошибка subplan блокирует зависимые шаги. Уже выполненный внешний side effect
либо компенсируется exact approved action, либо переводит parent в
`blocked/manual_recovery` с operator runbook. Частичный успех не показывается
как completed.

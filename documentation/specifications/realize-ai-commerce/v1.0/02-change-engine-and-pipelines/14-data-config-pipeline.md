# 14. Data, schema и configuration pipeline

- **Статус:** target specification

## 14.1. Data/Config Lane

Executor получает versioned intent с resource type, selectors, action и
validated parameters. Сервер:

1. разрешает selectors внутри installation;
2. проверяет access, field/path policy и limits;
3. строит dry-run, before-snapshot и impact summary;
4. фиксирует exact target IDs, versions и hashes;
5. получает требуемое approval;
6. повторно проверяет optimistic locks;
7. выполняет mutation через Payload Local API/domain service с hooks/access;
8. сохраняет after-state, audit и outbox;
9. предоставляет exact compensating rollback, если он поддерживается.

Dry-run без исполняемого apply не считается завершённой capability.

## 14.2. Schema Lane

Создание/удаление поля или типа данных является schema change, а не обычным
Payload CRUD. Оно требует code/migration artifact, анализа существующих данных,
backfill/drop policy, совместимости предыдущего release и restore proof.
 destructive data loss относится минимум к R3 и может быть operator-only.

## 14.3. Installation configuration

Skills, prompts, rules, roles и другие AI settings изменяются как versioned
drafts. Side effect для runtime возникает только при активации проверенного
`AIConfigRelease`. История версий и использованные run hashes сохраняются.

Draft validation проверяет schema, уникальность stable keys и references между
agent profiles, workflows, prompts, rules, skills и capability/check bindings.
Configuration compiler отдельно проверяет bindings и их сужения по текущему
system registry. Release manifest строится детерминированно; runtime никогда не
компилирует effective context из mutable draft.

Первый текущий configuration slice уже сохраняет aggregate draft/release и
durable replay через Payload API. Runtime side effect по-прежнему отсутствует:
activate/rollback и run binding остаются отдельным следующим gate.

## 14.4. Первый текущий adapter

`catalog.assignCategory.v1` — пример profile-specific descriptor. Он не
является шаблоном закрытого списка операций: новые adapters подключаются к тем
же policy/state/audit contracts.

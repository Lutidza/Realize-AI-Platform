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

## 14.5. Создание черновика CMS-страницы

Текущий adapter `pages.createDraft.v1` создаёт одну запись `pages` через тот
же Data Lane. Обычная контентная страница, например «О компании» с демо-текстом,
не требует изменения исходников. Модель остаётся в `analysis-readonly` и
предлагает операцию; запись выполняет Payload после отдельных действий
администратора. Исполнитель кода и очередь `CODE_CHANGE` в этой операции
не участвуют. Валидное предложение Data Lane нельзя преобразовать в план
изменения кода.

Intent содержит только `version: "1.0"`, `kind: "pages.createDraft.v1"`,
`title`, `slug`, `sections: [{heading?, body}]` и необязательный `description`.
Модель передаёт обычный текст. Поля Payload, Lexical JSON, HTML, SQL,
relationships и `_status` не принимаются. Ограничения: заголовок страницы и
каждой секции — 1–160 символов, `slug` — 1–100 строчных латинских букв/цифр
с одиночными дефисами, 1–12 секций с `body` до 4 000 символов, весь текст
секций вместе с заголовками — до 16 000 символов; `description` — до 320.
Служебные адреса проверяет host mapper, занятые адреса — Payload, включая
черновики. Существующая страница не перезаписывается.

Host-адаптер `src/collections/Pages/mapAIPageDraft.mapper.ts` преобразует текст
в существующие поля `Pages`: заголовок `lowImpact` hero, полноширинные колонки
блоков `Content` с обычными Lexical text nodes и SEO metadata. Модель не
выбирает типы блоков, ссылки или произвольные свойства схемы. Executor задаёт
`_status: "draft"` и вызывает Payload Local API с `draft: true`, исходным
`req`, `overrideAccess: false` и штатными hooks.

Последовательность в админке:

1. «Подготовить изменение данных» сохраняет dry-run с полным текстом,
   адресом, проверкой прав и отсутствия страницы; записи `pages` ещё нет.
2. «Подтвердить создание» связывает решение с точной версией и
   `operationHash`. Hash включает intent, hash серверного `createData`,
   версию mapper и условие отсутствия `slug`.
3. «Создать черновик» повторно проверяет права, адрес и точное содержимое
   рецепта. Запись страницы, смена состояния операции и audit выполняются
   в одной транзакции.
4. Результат содержит идентификатор и ссылку «Открыть черновик». Страница
   остаётся неопубликованной; эта capability не предоставляет публикацию.
5. Откат требует отдельного подтверждения актуального `rollbackHash`.
   Стратегия `delete-created-draft` удаляет только страницу, созданную этой
   операцией, если её содержание и версия не изменились и она никогда
   не публиковалась. Изменение, autosave, публикация, удаление или утрата
   доступа блокируют автоматическое удаление.

До создания `rollbackHash` связан с рецептом. После apply он заменяется
привязкой к `operationHash`, ID страницы, `updatedAt` и fingerprint фактического
документа. Исходный hash нельзя использовать для подтверждения удаления
созданной страницы. Закрытые `createData` и `appliedSnapshot` в публичный DTO
не выдаются.

Создание и откат удерживают PostgreSQL transaction advisory lock `page-drafts`.
Тот же lock подключён в `Pages.beforeOperation` для `create`, `update`,
`delete` и `restoreVersion`, включая autosave. Он берётся до чтения документа
внутри Payload operation: запись draft-версии не может пройти между проверкой
fingerprint и удалением. Самодельные записи в БД вне Payload не входят
в поддерживаемый контракт. Если host-адаптер страницы отключён, откат ранее
созданной операции блокируется: наличие исторического snapshot не заменяет
подключённый контракт записи и общей блокировки Pages.

Существующие intent, preview и hashes `catalog.assignCategory.v1` сохраняются.
Новый registry descriptor имеет action `page.createDraft`, чтение
`payload.pages` и запись `payload.pages.draft`; workflow adapter проверяет
точное совпадение kind с разрешённым binding и создаёт только dry-run.
Добавление descriptor совместимо с system version `1.0.0`: прежние releases,
включая ограниченные `maximumRelease: "1.0.0"`, продолжают компилироваться.
Они не получают page binding автоматически. Новые compiled snapshots
фиксируют актуальный system manifest hash; исторические snapshots не меняются.

Публичные поля описаны в [API-контракте](../03-runtime-delivery-and-security/22-api-and-streaming-contracts.md#операции-данных-и-черновик-страницы),
порядок обновления схемы — в [руководстве по миграциям](../../../../delivery/03-migrations-and-rollback.md).

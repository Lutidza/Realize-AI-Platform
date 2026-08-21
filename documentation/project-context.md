# Контекст проекта: Realize-E-Commerce

## Цель проекта

Платформа **Realize-E-Commerce** — конструктор интернет-магазинов на
Next.js App Router и Payload CMS 3. Основной фокус — быстрый старт магазина,
редактируемый каталог, каталожные страницы, корзина и базовый checkout, с
возможностью масштабирования за счёт модульных domain-сервисов.

## Технологии и runtime baseline

- Frontend: Next.js 16.3, React 19.2, TypeScript, Tailwind CSS, App Router.
- Backend/data: Payload CMS 3.88, PostgreSQL и versioned Payload migrations.
- Schema push по умолчанию отключён во всех средах и разрешается явным
  `PAYLOAD_DB_PUSH=true` только для disposable local DB.
- Runtime: Node.js 24.18.x и npm 11.15.x.
- Delivery: Docker/Compose, GitHub Actions, GHCR и exact-digest deployment на
  Linux VPS.
- Tests/evidence: Vitest и Playwright.
- MCP не является разрешённым runtime capability текущего Phase 0/1 slice.

## Активный контур приложения

- Storefront и application routes: `src/app/(app)/**`.
- Payload bridge: `src/app/(payload)/**`.
- Payload config/schema: `src/payload.config.ts`, `src/collections/**`,
  `src/plugins/index.ts`.
- Фактические shared UI owners: `src/components/**`, `src/providers/**`.
- Миграции: `src/migrations/**`.
- Workspace packages: `packages/**`.

`src/RealizeCore/**` и `src/app/_realize/**` quarantined по ADR-0001. Пути
`src/domain/**`, `src/ui/**` и root `src/app/api/**` сейчас не являются
фактическими active owners, даже если встречаются как target architecture в
старых AI-layer artifacts.

## Текущий Realize AI slice

Текущий slice — read-only чат с глобальным drawer на всех страницах Payload
Admin и полноэкранным `/admin/ai`. Контракты, plugin и Codex adapter разделены
по workspace packages; browser общается только с authenticated Payload API/SSE.
Development control plane работает только на loopback и создаёт ограниченный
Context Pack без secrets/binary/runtime state.

Поверх чата реализован approval-gated Change Request: план с exact paths,
проверками, risk level и hashes сохраняется в Payload, а admin отдельно
утверждает или отклоняет зафиксированную версию.

Для локальной разработки добавлен approval-gated code execution foundation. Payload
endpoint только создаёт durable PostgreSQL job и short-lived HMAC capability.
Отдельный `services/ai-execution-worker/**` атомарно claim-ит job, создаёт ветку
и Git worktree вне основного checkout, запускает Codex в `workspace-write`,
проверяет фактические paths, выполняет server-owned checks и сохраняет bounded
diff/evidence. После этого admin принимает или отклоняет уже фактический
результат отдельным hash-bound решением. Принятый exact diff можно отдельно
promote в чистый worktree: worker повторяет проверки, запускает независимый
ephemeral read-only Codex review, создаёт изолированный service commit и
поднимает TTL-bound standalone preview на loopback с sanitized PostgreSQL
clone. Preview readiness и storefront подтверждаются Chromium, после чего
admin принимает или отклоняет exact artifact ещё одним hash-bound решением.

Этот worker является только trusted local-development boundary. Локальный
preview artifact имеет вид `local-git-preview`, а не OCI image. Production
central worker/container, remote preview hostname, image digest/signing,
перенос принятого commit в release branch, push/deploy/rollback и commercial
enforcement в текущий slice не входят.

## Правило синхронизации для AI-агентов

`.ai` содержит активные runtime-инструкции.
`.codex` — адаптер Codex.
`documentation/` — source of truth для product-архитектурного контекста. Изменения
в контракте обязательно валидировать через `documentation/**` gate из
`.ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md`.

Целевая продуктовая и архитектурная спецификация AI Commerce доступна через
канонический entrypoint
`documentation/REALIZE_AI_COMMERCE_MASTER_SPEC_v1.0_RU.md`. Полный текст
версии 1.0 разложен в исполняемом порядке в
`documentation/specifications/realize-ai-commerce/v1.0/**`.

Фактический runbook реализации начинается с
`documentation/delivery/INDEX.md`. Текущие результаты и известные ограничения
зафиксированы в `documentation/reports/**`.

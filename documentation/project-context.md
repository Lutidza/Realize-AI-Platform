# Контекст проекта: Realize

- **Статус:** current implementation
- **Дата сверки:** 28 августа 2026 года

## Цель проекта

Realize — AI-управляемая CMS-платформа для сайтов разных типов. Текущий
репозиторий реализует первый e-commerce-профиль: каталог, storefront, корзину и
checkout. Целевая архитектура отделяет универсальное ядро управления
content/data/schema/design/code/delivery от профильных commerce-модулей.

Текст target specification не является доказательством runtime. Эта страница
фиксирует только подтверждённое состояние текущего checkout.

## Технологии и runtime baseline

- Frontend: Next.js 16.3, React 19.2, TypeScript, Tailwind CSS, App Router.
- Backend/data: Payload CMS 3.88, PostgreSQL и versioned Payload migrations.
- Schema push по умолчанию отключён во всех средах и разрешается явным
  `PAYLOAD_DB_PUSH=true` только для disposable local DB.
- Runtime: Node.js 24.18.x и npm 11.15.x.
- Delivery: Docker/Compose, GitHub Actions, GHCR и exact-digest deployment на
  Linux VPS.
- Tests/evidence: Vitest и Playwright.
- В execution worker MCP не является разрешённым runtime capability. В
  project Codex adapter настроены отдельные development MCP для browser/UI/Next
  tooling; Payload MCP endpoint сейчас отсутствует.

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

Диалоговый runtime остаётся read-only: глобальный drawer доступен на всех
страницах Payload Admin, а полноэкранный интерфейс — на `/admin/ai`. Контракты,
plugin и Codex adapter разделены по workspace packages; browser общается только
с authenticated Payload API/SSE. Development control plane работает только на
loopback и создаёт ограниченный Context Pack без secrets/binary/runtime state.

Поверх чата реализован approval-gated Change Request: план с exact paths,
проверками, risk level и hashes сохраняется в Payload, а admin отдельно
утверждает или отклоняет зафиксированную версию.

Первый approval-gated Data Lane позволяет агенту подготовить изменение
существующего каталога: добавить одну существующую категорию одному
существующему товару. Агент передаёт только versioned intent, а Payload сам
разрешает selectors, строит dry-run и before-snapshot, проверяет access и
optimistic lock, выполняет запись в транзакции и сохраняет audit/outbox.
Применение и compensating rollback требуют отдельных hash-bound подтверждений.
Произвольные CRUD, schema changes, SQL и массовые операции в этот slice не
входят.

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

Из принятого preview доступна отдельная source-control promotion. Payload
создаёт durable `SourcePromotion`, а worker повторно проверяет exact commit и
acceptance hashes, публикует его без force push в детерминированную ветку
`ai/changes/**` и создаёт open draft Pull Request. Результат сохраняется как
redacted hash-bound evidence. Этот lane не изменяет основной checkout, `main`,
не выполняет merge и не запускает release или production deploy.

После `preview_accepted` доступен отдельный provider-neutral release
control-plane. Payload создаёт `ReleaseCandidate`, а execution worker передаёт
exact service commit server-owned executable через JSON-port без shell и с
allowlisted environment. Готовый candidate обязан содержать immutable OCI
digest/ref, manifest hash, SBOM digest, verified signature, migration-set hash
и healthy HTTPS OCI preview. Admin утверждает или отклоняет этот exact artifact
отдельным `RELEASE_APPROVAL`; approval не запускает production deployment.

Local execution/preview worker остаётся trusted development boundary. Отдельный
opt-in GitHub/GHCR adapter реализует release JSON-port: публикует exact service
commit только в scoped candidate ref, запускает trusted GitHub Actions workflow,
проверяет signed immutable digest и разворачивает TTL-bound sanitized HTTPS
preview на VPS Docker Compose. Без `REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND` и
operator-owned GitHub/VPS configuration этот lane выключен fail-closed.

Payload Admin также содержит provider-neutral раздел `/admin/integrations`.
Первый adapter настраивает GitHub repository и write-only token. Browser получает
только redacted DTO; credential хранится в installation-local AES-256-GCM vault
с отдельным operator-owned `REALIZE_INTEGRATIONS_ENCRYPTION_KEY`. Включённое
GitHub connection передаётся только worker-owned source promotion и release
orchestrator subprocess; browser и Payload DTO credential не получают. Для
release adapter connection имеет приоритет над legacy repository/token
environment. Provider infrastructure (CLI paths, workflow и timeouts) остаётся
server-owned configuration.

Production authorization handoff, deploy/rollback controller и commercial
enforcement в текущий slice не входят. `RELEASE_APPROVAL` по-прежнему не даёт
worker-у production credentials и не запускает rollout.

Настраиваемый installation AI-layer со skills, knowledge, prompts, local
rules/roles/check bindings, agent profiles, evals и config releases также
является target и в текущем plugin ещё не реализован. Payload Admin не
редактирует системные `.ai/**` и `.codex/**`.

## Правило синхронизации для AI-агентов

`.ai` содержит активные runtime-инструкции.
`.codex` — адаптер Codex.
`documentation/` — source of truth для product-архитектурного контекста. Изменения
в контракте обязательно валидировать через `documentation/**` gate из
`.ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md`.

Целевая продуктовая и архитектурная спецификация Realize доступна через
канонический entrypoint
`documentation/REALIZE_AI_COMMERCE_MASTER_SPEC_v1.0_RU.md`. Полный текст
версии 1.0 разложен в нормативном порядке чтения в
`documentation/specifications/realize-ai-commerce/v1.0/**`.

Фактический runbook реализации начинается с
`documentation/delivery/INDEX.md`. Текущие результаты и известные ограничения
зафиксированы в `documentation/reports/**`.

# Структура проекта (источник для AI-layer)

- **Статус:** current implementation
- **Дата сверки:** 1 сентября 2026 года

## Активный продуктовый контур

- `src/app/(app)/**` — public site текущего e-commerce-профиля и application
  API routes.
- `src/app/(payload)/**` — generated Payload Admin/API bridge; generated
  page/layout вручную не редактируются.
- `src/payload.config.ts` — root Payload config и migration owner.
- `src/plugins/index.ts` — единая точка регистрации Payload plugins.
- `src/collections/**`, `src/globals/**`, `src/blocks/**` — активная Payload
  schema и content owners.
- `src/components/**`, `src/providers/**`, `src/utilities/**` — фактические
  shared UI и application helpers текущего storefront.
- `src/migrations/**` — versioned Payload migrations; production schema push
  запрещён.

ADR-0001 фиксирует этот contour как active. `src/RealizeCore/**` и
`src/app/_realize/**` остаются quarantined experimental/legacy contour и не
подмешиваются в active implementation без отдельного решения. Сегмент
`src/app/(reference)/**` является reference surface, а не owner production
storefront.

## Realize AI chat, Data Lane, execution, preview, source promotion и release gate

- `packages/ai-contracts/**` — DTO, API envelope, SSE events, adapter contracts,
  `CapabilityDescriptor`, installation config artifacts и declarative workflows.
- `packages/change-engine/**` — plan derivation,
  plan/implementation/preview/release bindings, protected paths, check
  registries, short-lived execution capability, exact-version capability
  registry, canonical config hashes, draft/release validation и effective config
  compiler.
- `packages/codex-adapter/**` — server-side Codex App Server adapter для
  read-only chat, изолированного `workspace-write` turn и отдельного ephemeral
  read-only reviewer.
- `packages/payload-ai-plugin/**` — Payload plugin, hidden runtime/config collections,
  authenticated endpoints, SSE bridge, глобальный Admin provider/drawer и
  полноэкранный UI, включая отдельные `DataOperation`, `SourcePromotion` и
  `ReleaseCandidate` aggregates, provider-neutral integration registry и
  installation Config API с redacted/audited DTO boundaries.
- `services/ai-control-plane/**` — loopback development control plane и bounded
  Context Pack.
- `services/ai-execution-worker/**` — отдельный PostgreSQL queue consumer,
  Git worktree orchestration, scope/diff gates, allowlisted checks, exact-diff
  promotion, reviewer, sanitized DB clone, loopback standalone preview,
  exact-commit GitHub branch/draft PR publication и provider-neutral OCI
  release JSON-port.
- `scripts/release/github-*.mjs` и
  `.github/workflows/prepare-release-candidate.yml` — GitHub/GHCR adapter,
  exact candidate ref, signed immutable image и evidence handoff.
- `compose.release-preview.yaml`, `scripts/deploy/remote-release-preview.sh` и
  cleanup workflow — TTL-bound sanitized HTTPS preview на scoped VPS Compose.
- `/admin/ai` — custom Payload root view только для admin role; тот же chat
  controller доступен в drawer на остальных страницах `/admin/**`;
  `REALIZE_AI_ENABLED` включает запуски, а при `false` UI показывает
  явный disabled state.
- `/admin/integrations` — custom Payload root view для масштабируемого каталога
  подключений; GitHub является первым adapter-ом, а credentials остаются
  write-only и доступны только server-side vault/runtime consumer.

Browser не вызывает Codex напрямую. Chat-поток: Payload Admin → authenticated
Payload endpoint → server-only control-plane client → Codex adapter.
Data-поток: versioned assistant intent → Payload-owned selector resolution и
dry-run → hash-bound approval → transactional Local API write с access/hooks и
optimistic lock → audit/outbox → отдельное rollback approval → exact
before-snapshot restore.
Code-поток: exact plan approval → durable execution job → отдельный worker →
изолированный worktree → diff/check evidence → отдельное implementation
acceptance → exact replay → repeated checks → independent review → isolated
commit → local preview → preview acceptance → независимые draft PR и OCI
candidate lanes → release approval.
MCP, основной checkout и production deployment authority worker-у не выдаются;
source promotion не получает merge authority, а release executable получает
только явно allowlisted environment. Source/candidate refs и `release-preview`
environment не дают production deployment authority.

Typed foundation installation AI configuration находится в
`packages/ai-contracts/**` и `packages/change-engine/**`. Его Payload owner уже
добавляет hidden draft/release/pointer/event collections и strict
`/api/realize-ai/config/*`; schema зафиксирована migration
`20260901_163832_ai_config_persistence`. Target `/admin/ai/settings`, eval,
activate/rollback и runtime binding остаются следующим slice. `.ai/**` и
`.codex/**` не являются client-editable data.

## Delivery и эксплуатация

- `Dockerfile`, `compose.yaml`, `.dockerignore` — production-like container
  baseline и single-host PostgreSQL/web stack.
- `.github/workflows/ci.yml` — CI gates на чистой PostgreSQL.
- `.github/workflows/release.yml` — OCI build, SBOM/provenance, vulnerability
  scan и staging promotion.
- `.github/workflows/reusable-deploy.yml` — exact-digest SSH deployment.
- `.github/workflows/rollback.yml` — ручной application rollback.
- `scripts/deploy/**`, `scripts/release/**`, `scripts/security/**` — deployment,
  manifest и repository-security owners.
- `scripts/migrations/**` — backup/restore proof, semantic schema evidence и
  guarded adoption существующей schema-push БД.
- `src/app/(app)/api/health/**` — liveness/readiness.
- `documentation/delivery/**` — operator runbooks.

## Tests

- `tests/int/**` — contracts, capability/config foundation и Config API,
  migration/access/plugin,
  Context Pack, execution/promotion worktrees, reviewer parsing и runtime
  primitives.
- `tests/e2e/**` — browser smoke tests и real API approval regression.
- Browser evidence для `/admin/ai` хранится в
  `documentation/reports/evidence/**`.

## AI-layer

- `.ai/**` — активные rules, checks, workflows, roles и local agent tools.
- `.codex/**` — Codex adapters к active AI-layer.
- [.ai-workspace/](../../.ai-workspace/README.md) — локальные материалы задач
  агентов: референсы, скриншоты, снимки страниц, логи и черновики. Содержимое
  задач исключено из Git; постоянные документы хранятся в `documentation/`.
- `AGENTS.md` — корневой entrypoint.
- `documentation/project-context.md` — канонический контекст проекта.
- `documentation/specifications/**` — нормативные product/architecture specs.

AI-layer audit от 2026-08-17 сохранён как historical evidence в
`documentation/reports/AI-LAYER-FOREIGN-ARTIFACT-AUDIT.md`. Текущее
состояние определяется active `.ai/**`, `.codex/**` и фактическими paths,
а не исходными findings отчёта.

## Принципы владения

- Payload schema/config/access меняются в активном `src/**` owner или через
  plugin transformer; generated artifacts обновляются только генераторами.
- Public contracts не отдают raw Payload documents; DTO и mapper имеют явного
  owner-а.
- Search/indexing остаётся derived layer, Payload/PostgreSQL — source of truth.
- Product UI не смешивается с Payload Admin plugin UI.
- Production release — immutable digest; migrations выполняются до web
  rollout, rollback не rebuild-ит image.

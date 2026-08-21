# Структура проекта (источник для AI-layer)

## Активный продуктовый контур

- `src/app/(app)/**` — storefront и application API routes.
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

## Realize AI chat, execution и local-preview promotion

- `packages/ai-contracts/**` — DTO, API envelope, SSE events и adapter contract.
- `packages/change-engine/**` — plan derivation, plan/implementation/preview
  acceptance bindings, protected paths, check registries и short-lived
  execution capability.
- `packages/codex-adapter/**` — server-side Codex App Server adapter для
  read-only chat, изолированного `workspace-write` turn и отдельного ephemeral
  read-only reviewer.
- `packages/payload-ai-plugin/**` — Payload plugin, девять hidden collections,
  authenticated endpoints, SSE bridge, глобальный Admin provider/drawer и
  полноэкранный UI.
- `services/ai-control-plane/**` — loopback development control plane и bounded
  Context Pack.
- `services/ai-execution-worker/**` — отдельный PostgreSQL queue consumer,
  Git worktree orchestration, scope/diff gates, allowlisted checks, exact-diff
  promotion, reviewer, sanitized DB clone и loopback standalone preview.
- `/admin/ai` — custom Payload root view только для admin role; тот же chat
  controller доступен в drawer на остальных страницах `/admin/**`;
  `REALIZE_AI_ENABLED` включает запуски, а при `false` UI показывает
  явный disabled state.

Browser не вызывает Codex напрямую. Chat-поток: Payload Admin → authenticated
Payload endpoint → server-only control-plane client → Codex adapter.
Code-поток: exact plan approval → durable execution job → отдельный worker →
изолированный worktree → diff/check evidence → отдельное implementation
acceptance → exact replay → repeated checks → independent review → isolated
commit → local preview → preview acceptance. MCP, основной checkout,
production credentials, Git remote и deployment tools worker-у не выдаются.

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

- `tests/int/**` — contracts, access/plugin, Context Pack, execution/promotion
  worktrees, reviewer parsing и runtime primitives.
- `tests/e2e/**` — browser smoke tests и real API approval regression.
- Browser evidence для `/admin/ai` хранится в
  `documentation/reports/evidence/**`.

## AI-layer

- `.ai/**` — активные rules, checks, workflows, roles и local agent tools.
- `.codex/**` — Codex adapters к active AI-layer.
- `AGENTS.md` — корневой entrypoint.
- `documentation/project-context.md` — канонический контекст проекта.
- `documentation/specifications/**` — нормативные product/architecture specs.

AI-layer audit от 2026-08-17 зафиксировал foreign identity и stale paths; до
отдельной cleanup-задачи см.
`documentation/reports/AI-LAYER-FOREIGN-ARTIFACT-AUDIT.md`.

## Принципы владения

- Payload schema/config/access меняются в активном `src/**` owner или через
  plugin transformer; generated artifacts обновляются только генераторами.
- Public contracts не отдают raw Payload documents; DTO и mapper имеют явного
  owner-а.
- Search/indexing остаётся derived layer, Payload/PostgreSQL — source of truth.
- Product UI не смешивается с Payload Admin plugin UI.
- Production release — immutable digest; migrations выполняются до web
  rollout, rollback не rebuild-ит image.

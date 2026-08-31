# 30. Repository ownership

- **Статус:** target ownership contract с current mapping

## 30.1. Фактические owners

- `src/app/(app)/**` — текущий public e-commerce site и health/API routes;
- `src/app/(payload)/**`, `src/payload.config.ts`, `src/collections/**` —
  Payload runtime/schema;
- `packages/ai-contracts/**` — public/internal AI DTO;
- `packages/change-engine/**` — Change Engine;
- `packages/codex-adapter/**` — Codex adapter;
- `packages/payload-ai-plugin/**` — plugin, Admin и API;
- `services/ai-control-plane/**` и `services/ai-execution-worker/**` —
  execution services;
- `src/migrations/**` — versioned schema history;
- `documentation/**`, `.ai/**` и `.codex/**` — разные documentation/runtime
  instruction owners.

Полная current map хранится в
[project structure](../../../../architecture/project-structure.md).

## 30.2. Target evolution

Новый owner создаётся только при реальном code boundary и миграции consumers.
Планируемые `services/*`, `infra/*` или `src/domain/*` нельзя показывать как
существующие. Profile-specific code должен зависеть от core contracts, а core
не должен импортировать catalog/order implementation.

Frontend owner сначала ищется в фактическом `src/components/**` и routes;
переход к `src/ui/**` требует отдельного decomposition decision. Generated
Payload types/import maps и build artifacts вручную не редактируются.

## 30.3. Protected contours

System AI-layer, licensing/security, credential vault, deployment authority и
cross-installation operator code отделяются от client-editable project scope.
Agent-generated plugin/module размещается в project allowlist и не становится
core package без operator review/release.

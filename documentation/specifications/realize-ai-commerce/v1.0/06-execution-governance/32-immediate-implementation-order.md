# 32. Immediate implementation order

- **Статус:** current prioritized roadmap

## Шаг 1. Policy и capability foundation

Ввести generic `CapabilityDescriptor`, protected read/write scopes,
server-side policy projection и binding run/Change Request к system/config
hashes. Существующий `catalog.assignCategory.v1` мигрирует как первый adapter
без потери текущего behavior.

Текущее состояние: exact-version registry, descriptor первого adapter,
installation scope narrowing, binding к exact system manifest и deterministic
config/context hashes реализованы. Полный protected-resource projection и
binding Run/Change Request ещё остаются.

## Шаг 2. Installation AI-layer

Добавить draft/release data model, `/admin/ai/settings`, target config API,
validation/evals, activation и rollback. Локальные checks выбираются только из
server registry; `.ai/.codex` остаются read-only для Admin.

Текущее состояние: typed artifacts/workflows, validation, immutable release,
active pointer contract, pure compiler, hidden Payload persistence, migration и
strict aggregate Config API реализованы. Следующий slice — `/admin/ai/settings`
и per-artifact editing; после него eval/activation/runtime binding.

## Шаг 3. Универсальные end-to-end capabilities

Реализовать как минимум:

- content/data/config mutation вне catalog;
- schema field + safe migration;
- page/design/frontend change;
- project module или plugin.

Каждая проходит apply, checks, preview/acceptance и rollback/recovery по своему
классу.

## Шаг 4. Production authority

Добавить `PRODUCTION_AUTHORIZATION` и trusted exact-digest deployment
controller, связать его с существующим Release Candidate и проверить
application/database recovery.

## Шаг 5. Commercial и pilot

Реализовать license/usage ceilings, затем security/recovery/SLO pilot на 5–10
installations.

Косметическая переработка чата не блокирует эти шаги и выполняется отдельным
UI scope.

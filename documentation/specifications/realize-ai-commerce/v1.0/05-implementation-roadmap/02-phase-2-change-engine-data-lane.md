# Phase 2. Change Engine, Data Lane и installation configuration

- **Статус:** in progress

## Реализовано

- versioned Change Request и hash-bound plan decisions;
- server-owned policy/state foundation;
- первый profile adapter `catalog.assignCategory.v1`;
- dry-run, exact target resolution, transaction, optimistic lock, audit/outbox;
- отдельное approval/apply и compensating rollback.

## Осталось до exit

- generic `CapabilityDescriptor` registry и resource/action adapters;
- content/data/config operations без e-commerce coupling;
- field/path read/write deny projection;
- batch limits, partial-failure policy и profile packs;
- installation AI data model, `/admin/ai/settings`, validation/evals,
  config release/activation/rollback;
- run binding к exact `AIConfigSnapshot`;
- adversarial tests для injection, escalation и protected reads.

Exit достигается минимум двумя разными project profiles/adapters и полным
end-to-end apply/rollback, а не набором dry-run предложений.

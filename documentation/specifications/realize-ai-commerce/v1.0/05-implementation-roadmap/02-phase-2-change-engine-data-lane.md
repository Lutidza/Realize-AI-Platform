# Phase 2. Change Engine, Data Lane и installation configuration

- **Статус:** in progress

## Реализовано

- versioned Change Request и hash-bound plan decisions;
- server-owned policy/state foundation;
- первый profile adapter `catalog.assignCategory.v1`;
- generic exact-version `CapabilityDescriptor` registry и перенос первого
  profile adapter в registry;
- typed installation artifacts и declarative `WorkflowDefinition`;
- cross-reference/workflow validation, canonical SHA-256, immutable
  `AIConfigRelease`, active pointer contract и system-ceiling compiler;
- четыре hidden Payload collections, migration, strict aggregate Config API,
  optimistic draft replacement и durable idempotency replay;
- dry-run, exact target resolution, transaction, optimistic lock, audit/outbox;
- отдельное approval/apply и compensating rollback.

## Осталось до exit

- дополнительные resource/action adapters поверх generic registry;
- content/data/config operations без e-commerce coupling;
- field/path read/write deny projection;
- batch limits, partial-failure policy и profile packs;
- `/admin/ai/settings`, per-artifact API, evals и transactional config
  activation/rollback;
- run binding к exact `AIConfigSnapshot`;
- adversarial tests для injection, escalation и protected reads.

Exit достигается минимум двумя разными project profiles/adapters и полным
end-to-end apply/rollback, а не набором dry-run предложений.

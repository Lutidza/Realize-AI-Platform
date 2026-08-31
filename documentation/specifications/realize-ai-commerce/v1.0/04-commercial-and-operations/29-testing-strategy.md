# 29. Testing strategy

- **Статус:** target specification

## 29.1. Уровни

- contract/unit: DTO, state machine, hashes, policy и mappers;
- integration: Payload access/hooks, PostgreSQL transactions, queues и audit;
- migration: empty DB, upgrade, backward compatibility и restore proof;
- execution: worktree/path/sandbox/check/timeout/idempotency;
- browser: Admin flows, SSE/reconnect, approvals, preview и responsive UI;
- delivery: exact digest, signature, health, failed rollout и rollback;
- security: injection, escalation, hidden data, SSRF/egress и secret redaction;
- commercial: lease expiry, quota, retry/reconciliation и degraded mode.

## 29.2. Profile packs

Core suite не содержит e-commerce assumptions. Активный project profile
добавляет fixtures, routes, business invariants и browser scenarios. Первый
e-commerce pack проверяет catalog, product/category relations, cart/checkout и
profile-specific migrations.

## 29.3. Evidence

Capability не считается готовой по mock-only test. Mutation требует real
database evidence, UI — browser evidence, migration — clean/upgrade proof,
delivery — immutable artifact и recovery evidence. Пропущенный внешний test
явно фиксируется как непроверенный operational dependency.

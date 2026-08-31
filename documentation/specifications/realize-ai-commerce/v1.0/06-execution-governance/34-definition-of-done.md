# 34. Definition of Done

- **Статус:** target acceptance contract

Capability считается готовой только при выполнении применимых пунктов.

## Contract

- versioned DTO/schema/capability и владелец определены;
- target/current distinction отражена в docs;
- access, protected scopes, risk, limits и approvals покрыты;
- idempotency, conflicts, retry и cancellation определены.

## Execution

- реальный side effect проходит только server executor;
- exact plan/config/input hashes проверяются до mutation;
- audit/events/usage сохраняются;
- failure не маскируется как success;
- rollback или explicit manual recovery проверены.

## Evidence

- data capability протестирована с реальной PostgreSQL;
- schema change — empty/upgrade/restore proof;
- code capability — clean worktree, diff gates и checks;
- UI — browser evidence;
- release — immutable signed digest и health;
- production — approval-bound rollout и rollback drill.

## Security

- injection/escalation/hidden-data/cross-installation tests пройдены;
- secrets не появились в prompt, DTO, logs, diff или artifacts;
- локальный AI-layer не расширяет system policy;
- license не выдаёт security authority.

## Product completion

Функция доступна из согласованного интерфейса, объясняет blocked state и
работает end-to-end. Текстовый mock, disabled button, dry-run-only или
неприменяемое предложение не соответствуют DoD.

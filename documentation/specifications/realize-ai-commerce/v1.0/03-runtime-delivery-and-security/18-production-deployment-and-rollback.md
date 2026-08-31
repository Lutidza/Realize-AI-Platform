# 18. Production deployment и rollback

- **Статус:** target specification
- **Current gap:** production authorization controller ещё не реализован полностью

## 18.1. Production transition

Deployment принимает только approved Release Candidate с exact OCI digest,
signature, SBOM, migration-set hash, preview evidence и непросроченным
`PRODUCTION_AUTHORIZATION`.

Controller:

1. повторно проверяет license, actor, candidate и hashes;
2. создаёт backup/restore evidence;
3. применяет совместимые migrations one-shot;
4. разворачивает exact digest;
5. выполняет readiness и profile smoke checks;
6. фиксирует deployment aggregate и audit;
7. завершает успехом либо запускает согласованный application rollback.

Worker/модель не получают SSH, registry или production database credentials.
Side effects выполняет доверенный deployment service.

## 18.2. Rollback

Application rollback возвращает предыдущий проверенный digest и повторяет
health checks. Он не откатывает schema или данные автоматически.

Каждый release обязан иметь один из вариантов:

- backward-compatible migration;
- проверенный compensating migration;
- operator-approved restore plan с recovery point и допустимой потерей данных.

Data rollback и production restore относятся к отдельным approvals. Автоматический
restore поверх новых пользовательских данных запрещён.

## 18.3. Failure states

Неопределённый rollout, mismatch digest/signature, failed migration evidence,
expired approval или недоступная license verification до начала mutation
блокируют transition. После начатого rollout control plane обязан сохранить
durable recoverable state, а не терять ownership при timeout.

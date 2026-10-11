# Phase 4. Production delivery

- **Статус:** partial foundation

## Реализовано

Provider-neutral Release Candidate, JSON-port orchestrator, exact service
commit, OCI digest/ref, SBOM/signature/migration hashes, TTL-bound release
preview, release approval, GitHub/GHCR adapter и existing exact-digest
deploy/rollback workflows.

## Не реализовано как единый продуктовый lane

- `PRODUCTION_AUTHORIZATION` aggregate/command;
- trusted controller, связывающий Realize approval с exact deployment;
- production credential isolation от worker;
- durable rollout state и recovery after timeout;
- profile health gates перед завершением;
- database rollback/restore approvals;
- external pilot evidence на configured GHCR/VPS.

`RELEASE_APPROVAL` не запускает production и не считается заменой недостающего
controller. Exit — проверенный approval-bound rollout и rollback exact digest
на pilot installation.

Область фазы также включает [PLAT-09 и PLAT-11](../06-execution-governance/32-immediate-implementation-order.md):
совместимость manifest, upstream-обновление клиентского проекта, сохранение
локальных доработок, разрешение конфликтов и migration/recovery evidence.
Наличие exact-digest deployment само по себе не завершает контракт обновлений.

[GIT-01–GIT-06](../06-execution-governance/32-immediate-implementation-order.md)
декомпозируют системную и клиентскую Git-интеграции, отдельные pipeline и
проверяемый upstream update. Эти задачи остаются planned: текущий GitHub/GHCR
adapter не доказывает готовность двух областей доступа и доверия к внешнему CI.

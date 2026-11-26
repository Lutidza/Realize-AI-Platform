# Phase 4. Production delivery

- **Статус:** partial foundation

## Реализовано

Provider-neutral Release Candidate, JSON-port orchestrator, exact service
commit, OCI digest/ref, SBOM/signature/migration hashes, TTL-bound release
preview, release approval и GitHub/GHCR adapter.

`release.yml` передаёт в staging образ GHCR по digest сборки. При ручном
запуске с `deploy_production` тот же образ развёртывается в production после
успешного staging. [Workflow выпуска](../../../../../.github/workflows/release.yml)

Для ручного отката оператор выбирает окружение в `rollback.yml`. На сервере
`remote-rollback.sh` берёт ссылку на предыдущий образ из `.release/previous.env`,
запускает сервис `web` и проверяет его готовность через `/api/health/ready`.
[Workflow отката](../../../../../.github/workflows/rollback.yml) · [Скрипт отката](../../../../../scripts/deploy/remote-rollback.sh)

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

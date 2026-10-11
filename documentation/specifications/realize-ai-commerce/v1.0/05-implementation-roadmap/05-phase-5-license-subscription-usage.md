# Phase 5. License, subscription и usage

- **Статус:** planned

Нужно реализовать installation activation, signed lease, entitlements,
subscription state, usage reservation/reconciliation, quotas, metered overage,
operator views и degraded/grace behavior.

Технический ledger, reservations и аналитика расходов выполняются раньше
в [PLAT-04](../06-execution-governance/32-immediate-implementation-order.md),
чтобы измерять разработку/evals и принимать решения Model Router.
Эта фаза добавляет коммерческую нормализацию и entitlements поверх общего
учёта; отдельный конкурирующий ledger не создаётся.

Exit criteria:

- license только сужает capabilities и не обходит security;
- public site и доступ клиента к данным переживают control-plane outage;
- expired/revoked lease блокирует новые платные mutations fail-closed;
- retry не создаёт двойное списание;
- usage связан с run, pricing version и provider evidence без prompts/secrets;
- billing и license failure не оставляют начатый side effect без durable owner.

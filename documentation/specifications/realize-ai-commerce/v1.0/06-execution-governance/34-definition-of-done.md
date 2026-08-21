# 34. Definition of Done всей первой версии

Первая промышленная версия считается готовой, когда выполнены все условия.

## Product

- отдельный single-tenant site на клиента;
- рабочая CMS/ecommerce;
- AI chat в Payload;
- history и audit;
- data и code changes;
- preview;
- production deploy;
- rollback.

## AI

- Codex выполняется в isolated central worker;
- context строится из реального `.ai` layer;
- модель не выбирает installation context;
- budgets и usage работают;
- no secret leakage;
- no hidden production mutation.

## Security

- typed tools;
- access control;
- approvals hash-bound;
- protected paths/collections;
- signed artifacts;
- no permanent OpenAI key at client;
- cross-client isolation tests passed.

## Delivery

- Git-based;
- CI green;
- migrations;
- preview;
- immutable image;
- exact digest deploy;
- health verification;
- rollback tested.

## Commercial

- activation;
- signed lease;
- subscription;
- entitlements;
- usage ledger;
- grace;
- storefront survival under license outage.

## Operations

- backups;
- restore drill;
- metrics/logs/alerts;
- operator console;
- incident runbooks;
- pilot clients completed.

---


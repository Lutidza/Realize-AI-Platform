# 30. Рекомендуемая структура репозитория

На первом этапе нельзя одновременно переносить весь проект и строить pipeline. Рекомендуется эволюционный путь.

## 30.1. После Phase 0

```text
/
├── src/                         # существующее клиентское приложение
├── packages/
│   ├── ai-contracts/
│   ├── change-engine/
│   ├── payload-ai-plugin/
│   ├── codex-adapter/
│   ├── license-client/
│   └── module-registry/
├── services/
│   ├── ai-worker/
│   └── site-connector/
├── infra/
│   ├── docker/
│   ├── compose/
│   ├── ci/
│   └── deployment/
├── tests/
│   ├── int/
│   ├── e2e/
│   ├── security/
│   └── fixtures/
├── .ai/
├── .codex/
└── documentation/
```

## 30.2. Отдельный central control plane

Рекомендуется отдельный private repository либо отдельный верхнеуровневый monorepo, недоступный клиентам:

```text
realize-control-plane/
├── apps/operator-console
├── services/license
├── services/billing
├── services/orchestrator
├── services/usage
├── services/release
├── services/deployment
├── packages/contracts
└── infra
```

## 30.3. Client repositories

Для масштабирования рекомендуется:

- template repository;
- один private repo на client installation;
- core в versioned private packages;
- client repo хранит composition, content schema extensions, theme, site modules;
- AI branch per Change Request.

Это лучше, чем хранить 1 000 клиентских кастомизаций в одной общей code branch.

---


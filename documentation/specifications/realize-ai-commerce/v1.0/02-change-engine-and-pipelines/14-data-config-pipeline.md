# 14. Pipeline: data/config change

## 14.1. Применение

- товары;
- категории;
- страницы;
- blocks;
- media references;
- theme config;
- module config;
- navigation;
- SEO fields.

## 14.2. Полный процесс

### Stage 1. Intake

- сохранить исходный запрос;
- определить context target;
- определить actor;
- зафиксировать текущие document versions.

### Stage 2. Read and diagnose

- выполнить scoped reads;
- проверить существование документов;
- определить объём;
- обнаружить conflicts/locks.

### Stage 3. Declarative plan

Модель формирует `DataChangeSet`, но не выполняет его.

```ts
interface DataChangeSet {
  version: '1.0'
  changeRequestID: string
  operations: DataOperation[]
  affectedDocuments: Array<{
    collection: string
    id: string
    version?: string | number
  }>
  estimatedCount: number
  riskLevel: RiskLevel
  assumptions: string[]
  validations: ValidationRule[]
  rollbackStrategy: 'before-snapshot' | 'inverse-operation'
}
```

### Stage 4. Policy validation

Проверяется:

- collection allowlist;
- operation capability;
- document count limit;
- protected fields;
- actor access;
- current license entitlement;
- budget;
- operation schema;
- idempotency;
- stale versions.

### Stage 5. Dry-run

Executor:

- заново читает affected documents;
- сравнивает versions;
- строит before/after diff;
- не пишет production;
- вычисляет operation hash;
- сохраняет rollback snapshot.

### Stage 6. Approval

Пользователь видит:

- количество документов;
- какие поля изменятся;
- before/after examples;
- предупреждения;
- operation hash.

### Stage 7. Transactional execution

- начать transaction;
- повторить authorization;
- повторить optimistic version check;
- применить typed operations;
- передавать один `req` во все Local API operations;
- выполнить validation hooks;
- записать audit/outbox;
- commit;
- при ошибке rollback.

### Stage 8. Verification

- повторно прочитать изменённые документы;
- проверить count;
- проверить invariants;
- проверить search/index hooks;
- при необходимости открыть Live Preview.

### Stage 9. Acceptance and close

- показать результат;
- сохранить actual diff;
- закрыть change;
- списать usage.

## 14.3. Пример типизированной операции

```ts
const moveProductsTool = {
  name: 'catalog.moveProducts',
  inputSchema: z.object({
    productIDs: z.array(z.string()).min(1).max(500),
    targetCategoryID: z.string(),
    expectedVersions: z.record(z.string(), z.string()).optional(),
  }),
  policy: {
    capability: 'catalog.bulkMove',
    risk: 'R2',
    approval: 'BULK_DATA_APPROVAL',
  },
  execute: async ({ input, req }) => {
    // req already contains authenticated actor and installation context
    // no tenant/installation id is accepted from the model
  },
}
```

## 14.4. Запрещённый интерфейс

Нельзя предоставлять модели инструмент вида:

```ts
executeSQL({ sql: string })
```

Нельзя предоставлять универсальный инструмент:

```ts
payloadUpdate({ collection: string, where: unknown, data: unknown })
```

без server-side capability constraints и field allowlists.

---


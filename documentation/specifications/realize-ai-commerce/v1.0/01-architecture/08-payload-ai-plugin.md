# 8. Payload-плагин Realize AI

## 8.1. Назначение

Плагин является официальной точкой интеграции AI-функций в Payload CMS.

Рабочее имя пакета:

```text
@realize/payload-ai-control
```

Плагин должен реализовываться как Payload Config transformer и корректно объединять собственную конфигурацию с входящим Payload Config.

## 8.2. Два режима отключения

Нужно различать:

### Compile-time omission

Плагин вообще не добавлен в `plugins` конкретного проекта. Используется для проектов, где AI никогда не включался.

### Runtime disabled

Плагин установлен, schema и collections сохранены, но:

- лицензия не активна;
- entitlement отключён;
- администратор поставил feature flag;
- произошла приостановка подписки.

В runtime-disabled состоянии история и schema не удаляются. UI показывает причину, новые AI-runs не запускаются.

## 8.3. Пример публичного API плагина

```ts
import type { CollectionSlug, Plugin } from 'payload'

export type RealizeAIPluginOptions = {
  enabled?: boolean
  userCollection?: CollectionSlug
  admin?: {
    route?: string
    group?: string
    showDashboardCard?: boolean
    showDocumentActions?: boolean
  }
  runtime: {
    mode: 'local-development' | 'central-control-plane'
    controlPlaneURL?: string
    eventTransport?: 'sse' | 'websocket'
  }
  license: {
    installationIDEnv: string
    licenseLeasePath?: string
    publicVerificationKey: string
  }
  capabilities: {
    readProject: boolean
    readCMS: boolean
    mutateContent: boolean
    mutateCatalog: boolean
    changeTheme: boolean
    changeCode: boolean
    deployPreview: boolean
    deployProduction: boolean
    rollback: boolean
  }
  policy: {
    protectedCollections: CollectionSlug[]
    protectedGlobals: string[]
    protectedPaths: string[]
    maxBulkDocuments: number
    requireApprovalForAllWrites: boolean
  }
  access: {
    canUseChat: AccessResolver
    canViewRuns: AccessResolver
    canApproveDataChange: AccessResolver
    canApproveCodeChange: AccessResolver
    canDeployProduction: AccessResolver
    canRollback: AccessResolver
  }
  tools?: RealizeToolDefinition[]
  moduleRegistry?: RealizeModuleDefinition[]
}

export const realizeAIPlugin = (
  options: RealizeAIPluginOptions,
): Plugin => (incomingConfig) => {
  // validate -> merge -> return config
  return incomingConfig
}
```

## 8.4. Что плагин добавляет в Payload

- custom root view `/admin/ai`;
- dashboard card;
- optional document actions;
- collections AI management;
- custom endpoints;
- jobs/tasks;
- hooks для audit/outbox;
- access functions;
- license status provider;
- import-map entries;
- MCP integration или scoped tool gateway;
- health endpoint;
- admin navigation group `AI & Delivery`.

## 8.5. Обязательные правила merge

Плагин не должен:

- заменять существующий `admin` целиком;
- удалять существующие collections/globals/endpoints;
- ломать existing plugins order;
- вручную редактировать generated import map;
- создавать slug collision без понятной ошибки;
- незаметно менять access других collections;
- включать generic CRUD для всех коллекций.

## 8.6. Плагин как приватный пакет

Пакет публикуется в приватный registry агентства.

Требования:

- semantic versioning;
- changelog;
- compatibility matrix;
- plugin migrations;
- integration fixture app;
- unit/integration/e2e tests;
- signed package provenance или доставка только внутри signed images;
- отсутствие OpenAI secrets в package;
- отсутствие приватного license signing key.

---


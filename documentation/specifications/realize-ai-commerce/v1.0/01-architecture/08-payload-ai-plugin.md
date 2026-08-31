# 8. Payload AI plugin

- **Статус:** target specification
- **Текущий owner:** `packages/payload-ai-plugin/**`

## 8.1. Ответственность plugin

Plugin подключает к Payload:

- hidden operational collections и access policies;
- authenticated API/SSE endpoints;
- Admin views, drawer, contextual actions и settings;
- projection Change Requests, runs, approvals, evidence, preview, releases,
  integrations и usage;
- server-side client к control plane.

Plugin не является AI worker, shell gateway, license authority или местом
хранения OpenAI/production credentials.

## 8.2. Target configuration

Вместо закрытого набора флагов конкретных операций plugin получает
server-defined policy projection:

- installation identity и enabled state;
- доступные capability descriptors и profile adapters;
- protected read/write scopes;
- approval/risk policy references;
- разрешённые check bindings;
- control-plane и event transport;
- UI feature projection.

Browser получает только redacted projection. Переданные browser-ом role,
installation, capability или risk никогда не считаются доверенными.

## 8.3. Совместимость

Текущий plugin уже реализует chat, Change Requests, первый Data Lane,
execution/preview/source/release foundations и integrations. Расширение до
target выполняется через совместимые versioned contracts и миграции, без
выдачи существующим endpoint новых неявных прав.

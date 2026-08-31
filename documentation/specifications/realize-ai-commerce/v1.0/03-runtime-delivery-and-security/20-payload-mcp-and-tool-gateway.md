# 20. Tool gateway и optional MCP adapters

- **Статус:** target specification
- **Current fact:** Payload MCP endpoint `/api/mcp` в репозитории отсутствует

## 20.1. Tool gateway

Authenticated Tool Gateway публикует модели только server-owned tools из
активного capability registry. Каждый вызов привязан к installation, actor,
run, Change Request, config hash, expiry и scope.

Gateway выполняет schema validation, policy, rate/size limits, protected-scope
checks, idempotency и audit. Он возвращает bounded DTO, а не raw Payload
documents, secrets или database handles.

## 20.2. MCP

MCP может быть одним transport adapter поверх Tool Gateway, но не source of
authority. Наличие MCP server-а не выдаёт capabilities, а отсутствие MCP не
блокирует внутренний typed executor.

Project-specific MCP добавляется только после реализации endpoint, auth,
version pinning, threat review и runtime evidence. До этого ни документация, ни
`.codex/config.toml` не должны объявлять Payload MCP действующим.

## 20.3. Запрещённые tools

Не публикуются:

- unrestricted Payload CRUD;
- arbitrary SQL или shell;
- secret/credential readers;
- filesystem root или protected system layer;
- production deployment command без отдельного controller;
- межинсталляционные search/read tools.

External MCP/plugin output считается untrusted data и проходит те же injection
и redaction gates.

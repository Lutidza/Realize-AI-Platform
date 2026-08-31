# Адаптерный слой Codex

`.codex/` хранит исполняемые Codex-specific adapters: config, agents, prompts,
skills и procedures. Активные проектные rules/checks/workflows находятся в
`.ai/**`, а long-form product/architecture contracts — в `documentation/**`.

При конфликте `.ai/**` имеет приоритет; `.codex/**` синхронизируется как
adapter и не создаёт отдельный источник системных правил.

## Directory entrypoints

- корневой обзор — `.codex/README.md`;
- структура — `.codex/STRUCTURE.md`;
- project-specific MCP source of truth — `.codex/config.toml`;
- вложенные directory entrypoints называются `INDEX.md`;
- agent TOML содержит только поддерживаемые runtime fields;
- workflow prompts повторяют доменную структуру связанного `.ai` workflow.

## MCP

Текущие project-specific adapters:

- `recommerce-playwright`;
- `recommerce-tailwind`;
- `recommerce-next-devtools`.

Payload MCP не объявлен: в приложении нет `/api/mcp`. Реализованный
`/api/realize-ai` является product API и не должен подключаться через
`mcp-remote` без отдельного MCP security contract.

Availability проверяется фактически. Codex runtime может требовать зеркалировать
project entries в активный user config, но session-provided tools/plugins не
записываются сюда автоматически. Secrets, tokens и runtime state в `.codex/`
запрещены.

## Синхронизация

Изменение MCP config требует проверки:

- `.ai` MCP role/rule/check/workflow и registry;
- `documentation/architecture/mcp-tooling.md`;
- stale names/paths и secret assumptions;
- pinned dependency/version evidence при добавлении server-а.

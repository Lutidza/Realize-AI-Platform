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

## Мастерская дизайна

Для референсов, компонентов и тем доступен
[design-workshop](skills/design-workshop/SKILL.md). Он связывает каноническую
роль и процесс `.ai` с действующим frontend workflow. Skill не добавляет
инструменты записи в ChatGPT или предустановленные профили в БД Admin.

## MCP

Текущие project-specific adapters:

- `recommerce-playwright`;
- `recommerce-tailwind`;
- `recommerce-next-devtools`;
- `realize-internal` — локальный developer endpoint с Repo/Git/S1 reads.

Payload MCP не объявлен: в приложении нет `/api/mcp`. Реализованный
`/api/realize-ai` является product API и не должен подключаться через
`mcp-remote` без отдельного MCP security contract.

Отдельный Realize Internal MCP реализован в `services/internal-mcp`.
Managed instances управляются из «MCP-серверы» в Admin. Текущая client entry
подключает отдельный developer bootstrap на `127.0.0.1:4319`, установленный
локально как `realize-mcp.service`; он не использует БД или Pages grants.
Режимы, инструменты S1 и fallback описаны в
[MCP tooling](../documentation/architecture/mcp-tooling.md).

`http_headers_helper` вызывает `scripts/runtime/readLocalMcpHeaders.controller.mjs`
на exact Node локальной установки и получает ключ из `REALIZE_MCP_CLIENT_TOKEN`
или закрытого `~/.local/share/realize-ai-cms/internal-mcp.env`. Значение не
хранится в TOML. На другой машине нужны собственные service/credential и
актуальный путь runtime. Новые tools доступны после открытия новой Codex
сессии; наличие config проверяется отдельно от фактического подключения.

Availability проверяется фактически. Codex runtime может требовать зеркалировать
project entries в активный user config, но session-provided tools/plugins не
записываются сюда автоматически. Secrets, tokens и runtime state в `.codex/`
запрещены.

## Приёмка поиска

После изменения инструмента или диагностики используй
[процедуру search-acceptance](prompts/search-acceptance.md).
Она запускает `npm run check:search` с отдельными БД/процессами и проверяет
полноту отчёта по каноническому правилу `.ai`. Для обычного поиска этот запуск
не требуется; дополнительная модель или search-worker не нужны.

## Синхронизация

Изменение MCP config требует проверки:

- `.ai` MCP role/rule/check/workflow и registry;
- `documentation/architecture/mcp-tooling.md`;
- stale names/paths и secret assumptions;
- pinned dependency/version evidence при добавлении server-а.

# MCP tooling

- **Статус:** current Codex adapter context
- **Source of truth:** `.codex/config.toml`

## Project-specific servers

Текущий project contract содержит:

- `recommerce-playwright` — browser/runtime evidence;
- `recommerce-tailwind` — Tailwind UI assistance;
- `recommerce-next-devtools` — Next.js docs и development diagnostics.

Доступность каждого server-а проверяется в текущей Codex session. Запись в
project config не является доказательством запущенного runtime.

## Payload MCP

Payload MCP server и endpoint `/api/mcp` в текущем приложении отсутствуют.
Поэтому `recommerce-payload` удалён из project config. Внутренний
`/api/realize-ai` и typed Payload executors не являются MCP.

Новый Payload MCP можно добавить только после реализации endpoint,
authentication, least-privilege tool registry, protected-scope policy,
version/source evidence и runtime tests. Secret не хранится в Git,
`documentation/**`, `.ai/**` или `.codex/**`.

## Policy

Активные правила выбора MCP, availability и fallback находятся в
`.ai/rules/external-tools/**` и MCP workflow. Session-provided/plugin tools не
становятся постоянным project contract автоматически. Execution worker не
получает MCP как скрытый обход Change Engine.

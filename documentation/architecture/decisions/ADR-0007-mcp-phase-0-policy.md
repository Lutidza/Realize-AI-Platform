# ADR-0007: MCP policy for Phase 0/1

## Status

accepted

## Context

В active AI-layer обнаружены ссылки на отсутствующие MCP/workflow artifacts и identifiers прежнего имени проекта. Они не могут становиться runtime dependency нового чата.

## Decision

Phase 0/1 AI chat не зависит от project-local MCP servers. Read-only worker получает контекст из allowlisted repository checkout. Любой будущий MCP/tool gateway подключается только после отдельного contract, threat model, allowlist и health check.

## Consequences

- отсутствие MCP не блокирует read-only chat;
- чужие/stale aliases не копируются в runtime config;
- generic Payload CRUD не выставляется модели;
- cleanup active AI-layer выполняется отдельным синхронизационным change без смешивания с plugin code.

# 22. API и streaming contracts

- **Статус:** target specification

## 22.1. Общие правила

Payload API namespace — `/api/realize-ai`. Browser использует authenticated
same-origin calls. Request DTO versioned, strict и не принимает доверенные
identity/role/risk значения. Mutation поддерживает idempotency key и
`expectedVersion`; hash-bound commands также передают ожидаемый artifact hash.

Success и error DTO не раскрывают stack, prompt, secret или protected content.
Stable error codes различают forbidden, conflict, stale approval, validation,
rate limit, unavailable dependency и internal failure.

## 22.2. Текущие группы API

Current runtime содержит status, integrations, conversations/messages,
changes/approvals, data operations/apply/rollback, execution/acceptance,
preview, source promotion, release candidates, runs/events/cancel.

Это описание групп, а не гарантия универсальных capabilities: фактический Data
Lane пока ограничен `catalog.assignCategory.v1`.

## 22.3. Target configuration API

Namespace `/api/realize-ai/config/*` предоставляет:

- CRUD только для draft skills, knowledge, prompts, local rules, roles, check
  bindings, agent profiles и evals;
- `POST /config/validate`;
- создание immutable config release;
- отдельные activate и rollback commands с expected hashes.

System `.ai/.codex`, license/security policy и executable registries не имеют
client-editable endpoint.

## 22.4. Streaming

`GET /runs/:id/events` использует SSE с monotonically ordered event IDs,
reconnect cursor и heartbeat. События содержат bounded typed payload и
redacted evidence references. Потеря соединения не отменяет durable run;
cancel является отдельной idempotent command и не гарантирует откат уже
завершённого side effect.

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

- CRUD только для draft skills, knowledge, prompts, local rules, roles,
  capability/check bindings, agent profiles, workflows и evals;
- `POST /config/validate`;
- создание immutable config release;
- отдельные activate и rollback commands с expected hashes.

System `.ai/.codex`, license/security policy и executable registries не имеют
client-editable endpoint.

Первый aggregate-oriented API slice имеет точный surface:

- `GET /config` — bootstrap projection: system ceiling, draft/release summaries
  и nullable active pointer;
- `POST /config/drafts` — создать editing draft с `expectedRevision: 0`;
- `GET /config/drafts/:id` — получить explicit draft DTO;
- `PUT /config/drafts/:id` — полностью заменить editable artifacts по exact
  aggregate revision;
- `POST /config/validate` — проверить exact draft revision и при success
  перевести её в `ready`;
- `POST /config/releases` — создать immutable release из exact ready revision и
  exact expected system manifest;
- `GET /config/releases/:id` — получить explicit immutable release DTO.

Payload регистрирует эти пути без `/api` как `/realize-ai/config/*`. Mutation
body всегда содержит `schemaVersion: "1.0"`, проходит exact-key parsing и не
принимает actor, timestamps, state, release version/hash или system policy от
browser. Для каждой mutation обязателен `Idempotency-Key`; canonical body,
action и resource binding входят в request hash. Mutation response возвращает
bounded summary/validation DTO, а полные artifacts читаются отдельным GET.

Create/update проверяют base release ID и hash по immutable server record.
Release command дополнительно передаёт `expectedSystemManifestHash`; server сам
назначает release ID/version/time/actor и exact compatibility с текущей system
projection. Все enabled agent profiles должны успешно скомпилироваться внутри
system capability/check ceiling до persistence.

Этот surface ещё не является полным target CRUD по отдельным artifact resources.
Delete, per-artifact routes, eval, activate и rollback добавляются отдельными
versioned командами после первого settings UI и не расширяют права описанных
выше endpoints.

Первый aggregate-oriented surface реализован в
`packages/payload-ai-plugin/src/endpoints/aiConfig*.ts` и закрыт отдельным
`canManageAIConfiguration` access resolver.

## 22.4. Streaming

`GET /runs/:id/events` использует SSE с monotonically ordered event IDs,
reconnect cursor и heartbeat. События содержат bounded typed payload и
redacted evidence references. Потеря соединения не отменяет durable run;
cancel является отдельной idempotent command и не гарантирует откат уже
завершённого side effect.

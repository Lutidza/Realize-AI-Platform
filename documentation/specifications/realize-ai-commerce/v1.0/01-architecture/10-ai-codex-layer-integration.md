# 10. Интеграция существующего `.ai` и `.codex` слоя

## 10.1. Что сохраняется

Сохраняются как source of truth:

- `AGENTS.md`;
- `.ai/README.md`;
- `.ai/STRUCTURE.md`;
- `.ai/system/**`;
- `.ai/roles/**`;
- `.ai/rules/**`;
- `.ai/checks/**`;
- `.ai/workflows/**`;
- `.ai/registry/**`;
- `.ai/templates/**`;
- `.ai/worker-profiles/**`;
- `.codex/skills/**`;
- `.codex/config.toml` после актуализации.

## 10.2. Что необходимо изменить

### Runtime persistence

Текущий SQLite runtime сохраняется как local-development adapter.

Для production необходимо:

- выделить domain contracts;
- реализовать Postgres persistence adapter;
- добавить durable queue/lease semantics;
- добавить outbox;
- добавить optimistic locking;
- добавить retention/archiving;
- убрать зависимость production от локальных файловых paths.

### Agent monitor

Существующий Vite monitor не должен запускаться как отдельный локальный preview в production.

Нужно:

- переиспользовать его UX-концепции и компоненты;
- перенести их в Payload Custom View;
- заменить loopback gateway на authenticated plugin/control-plane API;
- сохранить local monitor для IDE/debug mode.

### Codex process model

Нельзя запускать `codex exec` непосредственно из Next.js HTTP request.

Нужно:

- отдельный worker process/container;
- durable job;
- Codex App Server или SDK adapter;
- streaming event normalization;
- cancellation;
- timeout;
- resource limits;
- isolated worktree;
- explicit sandbox profile.

## 10.3. Context Pack Compiler

Для каждого run создаётся immutable Context Pack.

Состав:

```yaml
context_pack:
  identity:
    installation_id: server-injected
    project_id: server-injected
    actor_id: authenticated-user
    actor_permissions: resolved-server-side
  task:
    user_request: original-message
    normalized_intent: classified-intent
    change_type: read|data|config|theme|code|schema|mixed
    risk_level: R0|R1|R2|R3|R4
  project:
    base_commit: sha
    payload_version: exact
    next_version: exact
    node_version: exact
    active_contour: canonical
  instructions:
    root: AGENTS.md
    roles: selected-role-cards
    workflows: selected-workflows
    rules: applicable-rules
    checks: applicable-checks
    skills: applicable-codex-skills
  scope:
    source_of_truth: paths
    contour_owner: string
    owner_layer: string
    allowed_paths: []
    forbidden_paths: []
    allowed_tools: []
    allowed_collections: []
  runtime:
    previous_runs: summarized-only
    blockers: []
    required_approvals: []
  hashes:
    instruction_hash: sha256
    scope_hash: sha256
    context_hash: sha256
```

## 10.4. Pre-edit Gate как product entity

Текущий pre-edit gate преобразуется в обязательную часть Change Request:

- source of truth;
- contour-owner;
- owner-layer;
- allowlist;
- planned create/edit/delete;
- checks;
- blockers;
- approval policy.

Без валидного scope manifest code worker не получает workspace-write.

## 10.5. Сопоставление текущих компонентов

| Текущий компонент | Использование в продукте | Необходимое изменение |
|---|---|---|
| `AGENTS.md` | корневые инструкции | синхронизировать с реальной структурой |
| `.ai/system/state-machine.md` | логическая основа | превратить в строгую server state machine |
| `.ai/workflows/**` | workflow templates | компилировать в stage plan |
| `.ai/checks/**` | gate catalog | сделать machine-readable check registry |
| `.ai/roles/**` | worker roles | использовать в Context Pack |
| `.ai/registry/**` | routing | добавить runtime compiler |
| `agent-search` | поиск контекста | обернуть в Context Retrieval Service |
| SQLite agent runtime | local IDE mode | портировать domain на Postgres |
| agent monitor | UX/prototype | встроить в Payload Admin |
| `.codex/config.toml` | worker adapter config | актуализировать и генерировать per-run config |
| Payload MCP declaration | tool transport | установить и жёстко ограничить либо заменить custom gateway |

---


# Структура Codex-слоя

```yaml
artifact_id: codex-adapter-layer-structure
artifact_type: codex-adapter-structure
owner_layer: .codex/
runtime_sources:
  - .codex/README.md
  - .codex/config.toml
```

## Active layout

```text
.codex/
├── README.md
├── STRUCTURE.md
├── config.toml
├── agents/
│   ├── delivery/git/{commit,push,manage,fetch,pull,merge}.json
│   └── frontend/next-react/guardrail/{INDEX.md,agent.toml}
├── prompts/
│   ├── search-acceptance.md
│   └── workflows/
│       ├── delivery/git/{commit,push,manage,fetch,pull,merge}.md
│       └── frontend/next-react/guardrail.md
└── skills/README.md
```

`.codex/` содержит только Codex adapters. Project rules/checks/workflows
остаются в `.ai/**`.
В `skills/` находятся каталог и отдельные `SKILL.md`; в схеме показаны
основные входы, полный список навыков ведётся в `skills/README.md`.

`agents/delivery/git/{commit,push,manage,fetch,pull,merge}.json` — профили запуска Git-воркеров.
Их читает `.ai/tools/git-delivery`; это не встроенный формат Codex agent.
Программный `inspect` не загружает модельный профиль или prompt.
Вход и доступные действия описаны в [Git-навыке](skills/git-commit-push/SKILL.md).

Локальное досье задачи не хранится в `.codex`: вход —
[шаблон TASK](../.ai/templates/task-workspace/TEMPLATE-TASK.md), CLI owner —
[task-workspace](../.ai/tools/task-workspace/README.md), материалы —
[.ai-workspace](../.ai-workspace/README.md). Адаптер следует существующему
[правилу lifecycle](../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md).

## Project-specific MCP

`.codex/config.toml` объявляет:

- `recommerce-playwright`;
- `recommerce-tailwind`;
- `recommerce-next-devtools`;
- `realize-internal` — локальный developer MCP для Repo/Git/S1.

`recommerce-payload` не входит в current contract, потому что Payload MCP
endpoint не реализован. Stale MCP entries нельзя восстанавливать без MCP
tooling workflow, security decision и runtime evidence.

Типы Codex artifacts, native skill metadata и будущие generated-секции карты
описаны в целевом [контракте артефактов](../documentation/architecture/engineering-artifacts.md).
Текущая карта авторская; автоматическая генерация ещё не включена.

Realize Internal MCP реализован отдельным процессом и Admin manager.
Текущая client entry использует отдельный developer bootstrap, а не managed
Admin instance. Запуск, доверенные профили и private credential helper описаны
в [MCP tooling](../documentation/architecture/mcp-tooling.md).

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
│   ├── delivery/git/{inspect,commit,push}.json
│   └── frontend/next-react/guardrail/{INDEX.md,agent.toml}
├── prompts/
│   ├── search-acceptance.md
│   └── workflows/
│       ├── delivery/git/{inspect,commit,push}.md
│       └── frontend/next-react/guardrail.md
└── skills/README.md
```

`.codex/` содержит только Codex adapters. Project rules/checks/workflows
остаются в `.ai/**`.
В `skills/` находятся каталог и отдельные `SKILL.md`; в схеме показаны
основные входы, полный список навыков ведётся в `skills/README.md`.

`agents/delivery/git/{inspect,commit,push}.json` — профили запуска локальных Git-воркеров.
Их читает `.ai/tools/git-delivery`; это не встроенный формат Codex agent.
Вход и доступные действия описаны в [Git-навыке](skills/git-commit-push/SKILL.md).

## Project-specific MCP

`.codex/config.toml` объявляет:

- `recommerce-playwright`;
- `recommerce-tailwind`;
- `recommerce-next-devtools`;
- `realize-internal` — локальный developer MCP для Repo/Git/S1.

`recommerce-payload` не входит в current contract, потому что Payload MCP
endpoint не реализован. Stale MCP entries нельзя восстанавливать без MCP
tooling workflow, security decision и runtime evidence.

Realize Internal MCP реализован отдельным процессом и Admin manager.
Текущая client entry использует отдельный developer bootstrap, а не managed
Admin instance. Запуск, доверенные профили и private credential helper описаны
в [MCP tooling](../documentation/architecture/mcp-tooling.md).

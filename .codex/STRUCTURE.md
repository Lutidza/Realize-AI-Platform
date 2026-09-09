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
│   └── delivery/git/{inspect,commit,push}.json
├── prompts/
│   └── workflows/delivery/git/{inspect,commit,push}.md
└── skills/
```

`.codex/` содержит только Codex adapters. Project rules/checks/workflows
остаются в `.ai/**`.

`agents/delivery/git/{inspect,commit,push}.json` — профили запуска локальных Git-воркеров.
Их читает `.ai/tools/git-delivery`; это не встроенный формат Codex agent.
Вход и доступные действия описаны в [Git-навыке](skills/git-commit-push/SKILL.md).

## Project-specific MCP

`.codex/config.toml` объявляет:

- `recommerce-playwright`;
- `recommerce-tailwind`;
- `recommerce-next-devtools`.

`recommerce-payload` не входит в current contract, потому что Payload MCP
endpoint не реализован. Stale MCP entries нельзя восстанавливать без MCP
tooling workflow, security decision и runtime evidence.

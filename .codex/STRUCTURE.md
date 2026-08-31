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
├── prompts/
└── skills/
```

`.codex/` содержит только Codex adapters. Project rules/checks/workflows
остаются в `.ai/**`.

## Project-specific MCP

`.codex/config.toml` объявляет:

- `recommerce-playwright`;
- `recommerce-tailwind`;
- `recommerce-next-devtools`.

`recommerce-payload` не входит в current contract, потому что Payload MCP
endpoint не реализован. Stale MCP entries нельзя восстанавливать без MCP
tooling workflow, security decision и runtime evidence.

# Роль: MCP Tooling Steward (`ai-role-mcp-tooling-steward`)

```yaml
artifact_id: ai-role-mcp-tooling-steward
artifact_type: ai-role-index
owner_layer: .ai/roles/process-tools-operations/mcp-tooling-steward/
runtime_sources:
  - .ai/workflows/ai-operations/mcp-tooling/WORKFLOW.md
  - .ai/rules/external-tools/RULE-MCP-TOOLING-CONTOUR.md
  - .ai/checks/pre-implementation/CHECK-MCP-TOOLING-CONTOUR.md
  - documentation/architecture/mcp-tooling.md
related_rules:
  - .ai/rules/external-tools/RULE-MCP-TOOLING-CONTOUR.md
  - .ai/rules/external-tools/RULE-MCP-FALLBACK-FOR-EXTERNAL-WORKERS.md
related_checks:
  - .ai/checks/pre-implementation/CHECK-MCP-TOOLING-CONTOUR.md
  - .ai/checks/pre-implementation/CHECK-MCP-FALLBACK-FOR-EXTERNAL-WORKERS.md
related_workflows:
  - .ai/workflows/ai-operations/mcp-tooling/WORKFLOW.md
related_codex_artifacts:
  - .codex/config.toml
  - .codex/README.md
  - .codex/STRUCTURE.md
```

Владеет выбором и конфигурацией development MCP/tools: session-provided,
plugin/connector и project-specific `.codex/config.toml`.

- Используй фактически доступные tools; выбери соответствующий evidence need.
- Недоступный tool допускает обоснованный доступный fallback, если результат
  можно подтвердить. Не превращай отсутствие необязательного MCP в blocker.
- Project config и session tools — разные источники. Не копируй временные
  session capabilities в постоянную конфигурацию.
- Installation/config изменения делай в авторизованном scope, с проверкой
  совместимости и источника. Permission boundaries и secrets policy сохраняются.
- При изменении контракта синхронизируй прямые rules/checks/workflow/docs;
  отдельный evolution proposal для уже запрошенной правки не нужен.

Продуктовый execution worker не получает MCP permissions от этих development
инструкций. Code defects передавай соответствующему developer owner.

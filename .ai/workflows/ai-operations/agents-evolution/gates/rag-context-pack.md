# RAG context pack gate (`rag_context_pack`)

```yaml
artifact_id: agents-evolution-gate-rag-context-pack
artifact_type: ai-workflow-gate
owner_layer: .ai/workflows/ai-operations/agents-evolution/gates/
owner_role: .ai/roles/process-tools-operations/ai-evolution-steward/INDEX.md
related_tools:
  - rg
  - .ai/tools/agent-search/
```

Найди изменяемый owner и его прямых consumers через rg/registry. Читай
нужные rules/checks/skill/docs один раз. Историю ищи только когда требуется
разобраться с повторяемым решением. Не составляй обязательный отчёт о каждом
открытом/отвергнутом файле; передай другому агенту лишь relevant paths и факты.

# Workflow: основная доставка (`main-delivery`)

```yaml
artifact_id: main-delivery-directory-index
artifact_type: ai-workflow-directory-index
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/core/main-delivery/
runtime_sources:
  - .ai/templates/readme/TEMPLATE-AI-RUNTIME-INDEX.md
related_artifacts:
  - .ai/workflows/core/main-delivery/WORKFLOW.md
```

Основной короткий порядок работы — `WORKFLOW.md`. Применяй rules/checks
по фактическому изменению; дополнительные worker/delivery workflows нужны
только для соответствующих действий.

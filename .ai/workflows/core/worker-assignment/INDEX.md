# Workflow: worker assignment (`worker-assignment`)

```yaml
artifact_id: worker-assignment-directory-index
artifact_type: ai-workflow-directory-index
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/core/worker-assignment/
runtime_sources:
  - .ai/templates/readme/TEMPLATE-AI-RUNTIME-INDEX.md
related_artifacts:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
```

Порядок фактического делегирования — `WORKFLOW.md`. Assignment message
достаточен для native collaboration. Полный runtime manifest нужен только
когда его использует выбранный external tool.

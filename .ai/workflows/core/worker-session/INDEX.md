# Workflow: worker session (`worker-session`)

```yaml
artifact_id: worker-session-directory-index
artifact_type: ai-workflow-directory-index
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/core/worker-session/
runtime_sources:
  - .ai/templates/readme/TEMPLATE-AI-RUNTIME-INDEX.md
related_artifacts:
  - .ai/workflows/core/worker-session/WORKFLOW.md
  - .ai/tools/agent-runtime/README.md
```

Режимы direct/native/external/managed external и cleanup — `WORKFLOW.md`.
Runtime writer documentation открывай только при работе с managed external
store; обычная native сессия не требует SQLite/monitor.

# Реестр правил AI runtime продукта

```yaml
artifact_id: ai-registry-rules-runtime
artifact_type: ai-rules-registry-shard
schema_version: 2
owner_layer: .ai/registry/rules/runtime/
coverage: [.ai/rules/runtime/]
entries:
  - entry_id: customer-ai-runtime
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/runtime/RULE-CUSTOMER-AI-RUNTIME.md
    owner_layer: .ai/rules/runtime/
    owner_roles: [.ai/roles/developer/backend/INDEX.md]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules: []
    related_checks: [.ai/checks/runtime/CHECK-CUSTOMER-AI-RUNTIME.md]
    related_workflows: []
    related_codex_artifacts: []
    related_tools: []
    routing_tags: [product-runtime, system-release, admin-overlay, execution]
    trigger: "Публикация системного AI release или изменение chat/workflow/execution consumers продукта."
```

Это правила продуктового runtime. Они не заменяют протокол разработки владельца
платформы из корневого [AGENTS.md](../../../../AGENTS.md).

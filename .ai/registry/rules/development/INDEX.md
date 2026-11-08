# Rules Registry Shard: Development

```yaml
artifact_id: ai-registry-rules-development
artifact_type: ai-rules-registry-shard
schema_version: 2
owner_layer: .ai/registry/rules/development/
coverage:
  - .ai/rules/development/*.md
  - .ai/registry/rules/development/frontend/INDEX.md
  - .ai/registry/rules/development/backend/INDEX.md
```

```yaml
entries:
  - entry_id: development-strict-principles
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/development/RULE-DEVELOPMENT-STRICT-PRINCIPLES.md
    owner_layer: .ai/rules/development/
    owner_roles:
      [
        .ai/roles/developer/frontend/INDEX.md,
        .ai/roles/developer/backend/INDEX.md,
      ]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules: [.ai/rules/development/RULE-CODE-STRUCTURE.md]
    related_checks:
      [.ai/checks/development/CHECK-DEVELOPMENT-STRICT-PRINCIPLES.md]
    related_workflows: [.ai/workflows/core/main-delivery/WORKFLOW.md]
    related_codex_artifacts: []
    related_tools: []
    routing_tags: [development, strict-principles, work-task]
    trigger: "Подготовка и проверка проектной рабочей задачи; обычный диалог не требует этого правила."
  - entry_id: code-structure
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/development/RULE-CODE-STRUCTURE.md
    owner_layer: .ai/rules/development/
    owner_roles:
      [
        .ai/roles/developer/frontend/INDEX.md,
        .ai/roles/developer/backend/INDEX.md,
      ]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules:
      [
        .ai/rules/development/RULE-CODE-NAMING.md,
        .ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md,
        .ai/rules/development/backend/RULE-DTO-CONTRACTS-NO-RAW-PAYLOAD.md,
        .ai/rules/scope-control/RULE-STALE-ARTIFACT-CLEANUP-AFTER-REFACTOR.md,
      ]
    related_checks: [.ai/checks/development/CHECK-CODE-STRUCTURE.md]
    related_workflows: []
    related_codex_artifacts:
      [.codex/skills/feature-decomposition-guard/SKILL.md]
    related_tools: []
    routing_tags:
      [
        development,
        structure,
        responsibility,
        decomposition,
        types,
        hooks,
        portability,
      ]
    trigger: "Создание или рефакторинг собственных исходников, выбор границ файлов и модулей, размещение типов, хуков и компонентов."
  - entry_id: code-naming
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/development/RULE-CODE-NAMING.md
    owner_layer: .ai/rules/development/
    owner_roles:
      [
        .ai/roles/developer/frontend/INDEX.md,
        .ai/roles/developer/backend/INDEX.md,
      ]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules:
      [
        .ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md,
        .ai/rules/scope-control/RULE-STALE-ARTIFACT-CLEANUP-AFTER-REFACTOR.md,
      ]
    related_checks: [.ai/checks/development/CHECK-CODE-NAMING.md]
    related_workflows: []
    related_codex_artifacts: []
    related_tools: []
    routing_tags:
      [development, naming, files, directories, identifiers, refactor]
    trigger: "Создание новых имён, переименование или рефакторинг собственных исходников, каталогов и программных сущностей."
  - entry_id: code-comment-discipline
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md
    owner_layer: .ai/rules/development/
    owner_roles:
      [
        .ai/roles/developer/frontend/INDEX.md,
        .ai/roles/developer/backend/INDEX.md,
      ]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules:
      [
        .ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md,
      ]
    related_checks: [.ai/checks/development/CHECK-CODE-COMMENT-DISCIPLINE.md]
    related_workflows: []
    related_codex_artifacts: [.codex/skills/code-comment-discipline/SKILL.md]
    related_tools: [.ai/tools/source-headers/README.md]
    routing_tags: [development, comments, docref, code]
    trigger: "Создание, изменение или рефакторинг собственных исходников, исполняемой конфигурации, шапок файлов или комментариев к контрактам."
  - entry_id: dependency-version-evidence-before-install
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/development/RULE-DEPENDENCY-VERSION-EVIDENCE-BEFORE-INSTALL.md
    owner_layer: .ai/rules/development/
    owner_roles:
      [
        .ai/roles/developer/frontend/INDEX.md,
        .ai/roles/developer/backend/INDEX.md,
      ]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules: []
    related_checks:
      [
        .ai/checks/development/CHECK-DEPENDENCY-VERSION-EVIDENCE-BEFORE-INSTALL.md,
      ]
    related_workflows: []
    related_codex_artifacts: []
    related_tools: [browser, official-package-registry, npm, pnpm, yarn, bun]
    routing_tags: [development, dependency, install, version]
    trigger: "Package, SDK, framework, MCP server, plugin, CLI/tooling package or dev dependency is installed, updated, replaced, pinned or recommended."
  - entry_id: no-historical-noise
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/development/RULE-NO-HISTORICAL-NOISE.md
    owner_layer: .ai/rules/development/
    owner_roles:
      [.ai/roles/process-tools-operations/documentation-steward/INDEX.md]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules: []
    related_checks: [.ai/checks/pre-implementation/CHECK-NO-HISTORICAL-NOISE.md]
    related_workflows: []
    related_codex_artifacts: []
    related_tools: []
    routing_tags: [development, documentation, noise]
    trigger: "Before adding historical context, old mistake rationale, stale paths or narrative noise to active artifact."
  - entry_id: search-scope-discipline
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md
    owner_layer: .ai/rules/development/
    owner_roles:
      [
        .ai/roles/developer/frontend/INDEX.md,
        .ai/roles/developer/backend/INDEX.md,
        .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md,
      ]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules: [.ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md]
    related_checks:
      [.ai/checks/pre-implementation/CHECK-SEARCH-SCOPE-DISCIPLINE.md]
    related_workflows: []
    related_codex_artifacts: []
    related_tools: [rg, .ai/tools/agent-search/]
    routing_tags: [development, search, scope]
    trigger: "Before repository search for work_task prep, source of truth, owner-layer, similar implementation, drift or references."
  - entry_id: performance-measurement
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/development/RULE-PERFORMANCE-MEASUREMENT.md
    owner_layer: .ai/rules/development/
    owner_roles:
      [
        .ai/roles/developer/frontend/INDEX.md,
        .ai/roles/developer/backend/INDEX.md,
      ]
    enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
    related_rules: []
    related_checks:
      [
        .ai/checks/pre-implementation/CHECK-PERFORMANCE-MEASUREMENT-SCOPE.md,
        .ai/checks/self-review/CHECK-PERFORMANCE-EVIDENCE.md,
      ]
    related_workflows:
      [.ai/workflows/quality/performance-measurement/WORKFLOW.md]
    related_codex_artifacts: []
    related_tools: []
    routing_tags:
      [development, quality, performance, benchmark, observability]
    trigger: "Задача оптимизирует производительность, расследует регрессию или меняет performance budget/критичный горячий путь."
```

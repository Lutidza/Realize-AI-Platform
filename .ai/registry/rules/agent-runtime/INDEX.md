# Rules Registry Shard: Agent Runtime

```yaml
artifact_id: ai-registry-rules-agent-runtime
artifact_type: ai-rules-registry-shard
schema_version: 2
owner_layer: .ai/registry/rules/agent-runtime/
coverage:
  - .ai/rules/agent-runtime/
  - .ai/checks/self-review/CHECK-AGENT-RUNTIME-MAINTENANCE-REPORT.md
```

```yaml
entries:
  - entry_id: worker-session-lifecycle-and-autonomous-mode
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md
    owner_layer: .ai/rules/agent-runtime/
    owner_roles:
      [.ai/roles/process-tools-operations/scope-contour-owner/INDEX.md]
    related_rules: []
    related_checks:
      [
        .ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md,
        .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md,
        .ai/checks/worker-runtime/CHECK-WORKER-DIALOG-SURFACE-BUDGET.md,
        .ai/checks/self-review/CHECK-WORKER-SESSION-LIFECYCLE-BEFORE-HANDOFF.md,
      ]
    related_workflows: [.ai/workflows/core/worker-session/WORKFLOW.md]
    related_codex_artifacts:
      [.codex/skills/codex-external-worker-session/SKILL.md]
    related_tools: [.ai/tools/agent-runtime/README.md, .ai/tools/agent-monitor/]
    routing_tags: [agent-runtime, worker-session, lifecycle, autonomous]
    trigger: "Lifecycle фактически запущенных worker-ов; native handles среды, external process handles, managed writer только при явном выборе этого режима."
  - entry_id: agent-monitor-service-lifecycle
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/agent-runtime/RULE-AGENT-MONITOR-SERVICE-LIFECYCLE.md
    owner_layer: .ai/rules/agent-runtime/
    owner_roles:
      [.ai/roles/process-tools-operations/scope-contour-owner/INDEX.md]
    related_rules:
      [
        .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md,
      ]
    related_checks:
      [
        .ai/checks/agent-runtime/CHECK-AGENT-MONITOR-SERVICE-LIFECYCLE.md,
        .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md,
      ]
    related_workflows:
      [.ai/workflows/ai-operations/agent-monitor-service-lifecycle/WORKFLOW.md]
    related_codex_artifacts:
      [.codex/skills/codex-external-worker-session/SKILL.md]
    related_tools: [.ai/tools/agent-runtime/, .ai/tools/agent-monitor/]
    routing_tags: [agent-runtime, monitor, lifecycle, managed]
    trigger: "Явная operator-задача на monitor/gateway или managed external запуск с project monitor; direct/native/обычный external: not_required."
  - entry_id: agent-runtime-maintenance-report
    entry_type: supporting_check
    status: active
    primary_artifact: .ai/checks/self-review/CHECK-AGENT-RUNTIME-MAINTENANCE-REPORT.md
    owner_layer: .ai/checks/self-review/
    owner_roles:
      [.ai/roles/process-tools-operations/scope-contour-owner/INDEX.md]
    related_rules:
      [
        .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md,
      ]
    related_checks: []
    related_workflows:
      [.ai/workflows/ai-operations/agent-runtime-maintenance/WORKFLOW.md]
    related_codex_artifacts: []
    related_tools: [.ai/tools/agent-runtime/README.md]
    routing_tags: [agent-runtime, maintenance, runtime-store]
    trigger: "After agent-runtime-maintenance, retention-cleanup, projection refresh or a step that serviced runtime.sqlite."
```

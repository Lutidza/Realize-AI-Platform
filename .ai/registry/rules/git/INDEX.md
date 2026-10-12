# Реестр правил Git

```yaml
artifact_id: ai-registry-rules-git
artifact_type: ai-rules-registry-shard
schema_version: 2
owner_layer: .ai/registry/rules/git/
coverage:
  - .ai/rules/git/
```

```yaml
entries:
  - entry_id: git-delivery
    entry_type: active_rule
    status: active
    primary_artifact: .ai/rules/git/RULE-GIT-DELIVERY.md
    owner_layer: .ai/rules/git/
    owner_roles:
      [.ai/roles/process-tools-operations/scope-contour-owner/INDEX.md]
    related_checks:
      [
        .ai/checks/pre-commit/CHECK-DELIVERY-COMMIT-SCOPE.md,
        .ai/checks/pre-push/CHECK-DELIVERY-PUSH-READINESS.md,
        .ai/checks/git/CHECK-GIT-MANAGEMENT-SCOPE.md,
        .ai/checks/git/CHECK-GIT-SYNC-READINESS.md,
        .ai/checks/git/CHECK-GIT-APPROVED-TREE-MERGE.md,
      ]
    related_workflows: [.ai/workflows/delivery/git/commit-push/WORKFLOW.md]
    related_codex_artifacts:
      [
        .codex/skills/git-commit-push/SKILL.md,
        .codex/agents/delivery/git/inspect.json,
        .codex/prompts/workflows/delivery/git/inspect.md,
        .codex/agents/delivery/git/commit.json,
        .codex/prompts/workflows/delivery/git/commit.md,
        .codex/agents/delivery/git/push.json,
        .codex/prompts/workflows/delivery/git/push.md,
        .codex/agents/delivery/git/manage.json,
        .codex/prompts/workflows/delivery/git/manage.md,
        .codex/agents/delivery/git/fetch.json,
        .codex/prompts/workflows/delivery/git/fetch.md,
        .codex/agents/delivery/git/pull.json,
        .codex/prompts/workflows/delivery/git/pull.md,
        .codex/agents/delivery/git/merge.json,
        .codex/prompts/workflows/delivery/git/merge.md,
      ]
    related_tools: [git, ssh, github]
    routing_tags:
      [
        git,
        github,
        delivery,
        inspect,
        commit,
        push,
        manage,
        fetch,
        pull,
        merge,
        approved-tree,
        remote,
        worktree,
        branch,
        https,
        ssh,
      ]
    trigger: "Чтение Git, управление remote/worktrees/ветками, staging, commit, fetch, pull, push или GitHub merge проверенного дерева рабочего слоя."
```

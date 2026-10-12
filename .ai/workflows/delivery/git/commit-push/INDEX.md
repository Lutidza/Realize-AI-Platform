# Git-операции (`delivery_git_commit_push`)

```yaml
artifact_id: delivery-git-commit-push
artifact_type: ai-workflow-index
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/delivery/git/commit-push/
runtime_sources:
  - .ai/workflows/delivery/git/commit-push/WORKFLOW.md
  - .ai/rules/git/RULE-GIT-DELIVERY.md
  - .ai/checks/pre-commit/CHECK-DELIVERY-COMMIT-SCOPE.md
  - .ai/checks/pre-push/CHECK-DELIVERY-PUSH-READINESS.md
  - .ai/checks/git/CHECK-GIT-MANAGEMENT-SCOPE.md
  - .ai/checks/git/CHECK-GIT-SYNC-READINESS.md
codex_adapter:
  - .codex/skills/git-commit-push/SKILL.md
```

## Назначение

Чтение состояния, управление remote/worktrees/ветками и разрешённые
commit/fetch/pull/push через отдельного Git-воркера.
Порядок и выбор проверок — [WORKFLOW.md](WORKFLOW.md).

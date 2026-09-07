# Workflow commit/push (`delivery_git_commit_push`)

```yaml
artifact_id: delivery-git-commit-push
artifact_type: ai-workflow-index
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/delivery/git/commit-push/
runtime_sources:
  - .ai/workflows/delivery/git/commit-push/WORKFLOW.md
  - .ai/rules/git/RULE-COMMIT-PUSH-SSH-DELIVERY.md
  - .ai/checks/pre-commit/CHECK-DELIVERY-COMMIT-SCOPE.md
  - .ai/checks/pre-push/CHECK-DELIVERY-PUSH-READINESS.md
codex_adapter:
  - .codex/skills/git-commit-push/SKILL.md
```

## Назначение

Входной файл GitHub SSH delivery для авторизованного пользователем commit/push.
Порядок и применимые checks описаны в `WORKFLOW.md`.

## Entrypoint

- Runtime contract: `.ai/workflows/delivery/git/commit-push/WORKFLOW.md`
- Delivery rule: `.ai/rules/git/RULE-COMMIT-PUSH-SSH-DELIVERY.md`
- Pre-commit check: `.ai/checks/pre-commit/CHECK-DELIVERY-COMMIT-SCOPE.md`
- Pre-push check: `.ai/checks/pre-push/CHECK-DELIVERY-PUSH-READINESS.md`

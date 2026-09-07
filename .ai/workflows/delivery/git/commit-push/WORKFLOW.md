# Workflow commit/push (`delivery_git_commit_push_workflow`)

```yaml
artifact_id: delivery-git-commit-push-workflow
artifact_type: ai-workflow
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/delivery/git/commit-push/
rules:
  - .ai/rules/git/RULE-COMMIT-PUSH-SSH-DELIVERY.md
checks:
  pre_commit:
    - .ai/checks/pre-commit/CHECK-DELIVERY-COMMIT-SCOPE.md
  pre_push:
    - .ai/checks/pre-push/CHECK-DELIVERY-PUSH-READINESS.md
codex_adapter:
  - .codex/skills/git-commit-push/SKILL.md
related_workflows:
  - .ai/workflows/core/main-delivery/WORKFLOW.md
```

## Запуск

Используется для commit/push, авторизованного пользователем. Не запускай delivery
из обычного запроса на правку кода. Уже полученную авторизацию не запрашивай
повторно; отдельный delivery worker или assignment-файл не нужны.

## Порядок

1. Проверь branch, scope и состояние worktree; определи, что входит в commit.
2. Выполни pre-commit check. Используй достаточное evidence текущего diff;
   недостающие проверки выбирай по риску, не запускай full suite автоматически.
3. Stage scoped paths, прочитай staged diff и создай commit.
4. Если запрошен push, выполни pre-push check, GitHub SSH preflight и push.
5. Сообщи hash, branch, результаты проверок и фактический статус доставки.

Авторизация commit не означает авторизацию push/merge/deploy. Ошибка SSH
останавливает push и сохраняет сделанный commit; fallback через token/HTTPS
не применяется. Не переписывай чужую историю или изменения.

## Worker runtime

Только для delivery внутри уже назначенной worker-runtime mission сохрани
результат по её lifecycle: `push_succeeded` или `push_failed`, diagnostic summary
без secrets, session transition и notification, если они входят в mission.
Не создавай runtime session специально для обычной CLI delivery.

Правило владеет safety conditions, checks — критериями проверки, Codex skill —
командами. Результат delivery не заменяет необходимые проверки изменения.

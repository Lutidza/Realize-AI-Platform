# CHECK-DELIVERY-PUSH-READINESS

```yaml
check_id: CHECK-DELIVERY-PUSH-READINESS
title: Проверка delivery readiness перед push
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/pre-push/
workflow: .ai/workflows/delivery/git/commit-push/WORKFLOW.md
rules:
  - .ai/rules/git/RULE-COMMIT-PUSH-SSH-DELIVERY.md
```

## Проверка перед push

- Запрос пользователя покрывает push; проверены commit hash, branch и target.
- Необходимые проверки относятся к публикуемому diff; после них нет изменений,
  которые делают evidence неактуальным.
- `origin` имеет вид `git@github.com:<owner>/<repo>.git`; в диагностике нет
  credentials или tokenized URL.
- SSH preflight выполнен в BatchMode. Ошибка auth блокирует push; HTTPS/token
  fallback не используется.
- Push выполняется в проверенную ветку, без неавторизованного force push.

Команды SSH находятся в `.codex/skills/git-commit-push/SKILL.md`.
Повторять app tests/build на этом gate без нового риска не нужно.

## Результат

В общий delivery result включи commit hash, branch, remote, preflight и результат
push. Session/job id и durable runtime result добавляются только при работе
в уже назначенной worker-runtime mission. Отсутствие runtime вне такой mission
не блокирует push.

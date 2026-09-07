# RULE-COMMIT-PUSH-SSH-DELIVERY

```yaml
rule_id: RULE-COMMIT-PUSH-SSH-DELIVERY
title: GitHub SSH-only commit/push delivery safety
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/git/
workflow: .ai/workflows/delivery/git/commit-push/WORKFLOW.md
checks:
  - .ai/checks/pre-commit/CHECK-DELIVERY-COMMIT-SCOPE.md
  - .ai/checks/pre-push/CHECK-DELIVERY-PUSH-READINESS.md
codex_adapter:
  - .codex/skills/git-commit-push/SKILL.md
```

## Контракт

Применяется к авторизованному пользователем commit/push. Сам запрос пользователя
задаёт delivery scope; отдельный worker, assignment-файл, runtime session или
повторное подтверждение не требуются.

- Проверь текущую ветку и фактический diff. Stage только относящиеся к задаче
  пути либо явно запрошенный snapshot; не включай чужие изменения и secrets.
- Используй результаты достаточных проверок текущего diff по
  `.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md`. Повторный full
  test/build suite ради commit/push не нужен; CI/release gates сохраняются.
- Выполни связанные pre-commit/pre-push checks. `origin` должен быть GitHub SSH
  remote вида `git@github.com:<owner>/<repo>.git`.
- Перед push проверь SSH в BatchMode. При ошибке auth останови push, сохрани
  локальный commit и сообщи причину; HTTPS/token fallback запрещён.
- Push направляй в проверенную ветку без force. Изменение истории и отдельные
  PR/merge операции должны входить в авторизованную задачу.
- Сообщи commit hash, branch, проверки и фактический результат push.

Если delivery выполняется внутри уже назначенной worker-runtime mission,
сохрани её result/session contract, включая `result: push_succeeded` при успехе.
Обычная CLI delivery не создаёт runtime state или notification ради отчётности.

## Блокеры

Неверный target, посторонние staged files, secrets, отсутствующая авторизация,
непройденная необходимая проверка или SSH failure блокируют соответствующее
действие. Отсутствие runtime writer вне runtime mission блокером не является.

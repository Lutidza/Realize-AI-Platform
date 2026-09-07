# CHECK-DELIVERY-COMMIT-SCOPE

```yaml
check_id: CHECK-DELIVERY-COMMIT-SCOPE
title: Проверка delivery scope перед commit
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/pre-commit/
workflows:
  - .ai/workflows/delivery/git/commit-push/WORKFLOW.md
rules:
  - .ai/rules/git/RULE-COMMIT-PUSH-SSH-DELIVERY.md
```

## Проверка перед commit

- Запрос пользователя покрывает commit и его scope; текущая ветка проверена.
- Просмотрены `git status --short` и staged diff; staged files относятся к
  задаче или явно запрошенному snapshot, чужие изменения исключены.
- В staged diff нет secrets/tokenized URLs, runtime logs, dumps и случайных
  build artifacts. Подозрительные значения не печатаются в отчёт.
- Необходимые проверки текущего изменения выполнены по риску; оставшиеся
  ограничения явно известны. Успешный неизменившийся diff не проверяется заново
  только из-за перехода к commit.

Неполный scope, secrets или провал необходимой проверки блокируют commit.
Assignment-файл и runtime signal нужны только если это условие уже назначенной
worker mission. Для обычного запроса commit достаточно краткого сообщения о
scope, результате проверок и затем commit hash.

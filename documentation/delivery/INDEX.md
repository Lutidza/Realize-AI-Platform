# Delivery и Realize AI: рабочий индекс

- **Статус:** current implementation
- **Дата сверки:** 28 августа 2026 года

Этот раздел описывает фактически реализованный baseline и не подменяет target
specification.

## Runbooks

1. [Локальный Admin AI](01-local-admin-ai.md)
2. [CI, release и deployment](02-ci-release-deploy.md)
3. [Миграции и rollback](03-migrations-and-rollback.md)

## Подтверждённые возможности

- exact Node/npm, PostgreSQL migrations, health, Docker/Compose, CI и GHCR;
- Payload drawer и `/admin/ai`, authenticated API/SSE и read-only Codex chat;
- Change Requests с exact plan approval;
- первый Data Lane `catalog.assignCategory.v1` с apply и compensating rollback;
- durable isolated code execution, scope gates, checks и implementation
  acceptance;
- clean promotion, independent review, sanitized local preview и preview
  acceptance;
- независимые draft Pull Request и OCI Release Candidate lanes;
- `/admin/integrations` с GitHub adapter и write-only encrypted token;
- десять versioned Payload migrations.

## Неподтверждённые или отсутствующие границы

- local worker является trusted development boundary, не production sandbox;
- Payload MCP `/api/mcp` отсутствует;
- installation AI settings/config releases отсутствуют;
- внешний GHCR/VPS preview требует operator configuration и не имеет local
  runtime evidence;
- `RELEASE_APPROVAL` не связан с production deployment;
- production authorization controller, database restore automation и
  commercial enforcement отсутствуют;
- локальный environment не подтверждает Docker daemon или внешние credentials.

Исторические результаты находятся в `documentation/reports/**`. Они сохраняют
состояние на свою дату; current truth проверяется по коду и этим runbooks.

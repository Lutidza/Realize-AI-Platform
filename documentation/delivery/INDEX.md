# Delivery и Realize AI: рабочий индекс

Этот раздел описывает фактически реализованный delivery baseline, глобальный
чат в Payload Admin, approval-gated execution и local-preview promotion. Каноническая
продуктовая спецификация остаётся в
`documentation/specifications/realize-ai-commerce/v1.0/**`.

## Последовательность

1. [Локальный запуск и чат в Payload Admin](01-local-admin-ai.md)
2. [CI, release и выкладка](02-ci-release-deploy.md)
3. [Миграции и rollback](03-migrations-and-rollback.md)

## Фактический статус

- Phase 0 delivery baseline реализован в коде: exact runtime, migrations,
  health/readiness, Dockerfile, Compose и GitHub Actions.
- Read-only часть Phase 1 реализована: Payload plugin, глобальный Admin drawer,
  `/admin/ai`, typed API, SSE с возобновлением, cancel и Codex App Server
  adapter.
- Реализован approval-gated code foundation: durable Change Request, exact
  plan approval, `POST /changes/:id/execute`, PostgreSQL job queue, отдельный
  local worker, Git worktree, protected-path/check allowlists, bounded
  diff/evidence и второе implementation acceptance.
- Реализован локальный Phase 3 vertical slice: принятый exact diff повторно
  применяется в чистом worktree, проходит server-owned checks и отдельный
  ephemeral read-only review, получает изолированный service commit, затем
  запускается как standalone Next build на loopback с sanitized PostgreSQL
  clone, Chromium smoke, TTL cleanup и отдельным preview acceptance.
- Apply в основной checkout, push, OCI image/digest, удалённый preview hostname
  и production deploy намеренно не реализованы; preview acceptance их не
  запускает автоматически.
- Локальный control plane предназначен только для loopback development. Он
  хранит активные runs в памяти и не является production central service.
- Фактическая выкладка не выполнялась: в локальной среде нет Docker daemon, а
  GitHub environments, GHCR/VPS credentials и production domain находятся вне
  репозитория.

## Основные entrypoints

- `Dockerfile`, `compose.yaml`, `.env.example`;
- `.github/workflows/ci.yml`, `release.yml`, `rollback.yml`;
- `scripts/deploy/remote-deploy.sh`, `remote-rollback.sh`;
- `scripts/migrations/adopt-schema-push.mjs`;
- `packages/payload-ai-plugin/**`, `services/ai-control-plane/**`,
  `services/ai-execution-worker/**`;
- `src/app/(app)/api/health/**`, `src/migrations/**`;
- `documentation/reports/EPIC-000-IMPLEMENTATION-REPORT.md`.

Текущий UI/API/security evidence описан в
[отчёте Admin AI drawer и plan approval](../reports/ADMIN-AI-DRAWER-APPROVAL-2026-08-18.md).

Execution boundary и актуальные ограничения зафиксированы в
[отчёте isolated execution foundation](../reports/ADMIN-AI-ISOLATED-EXECUTION-2026-08-21.md).

Accepted-diff promotion и runtime evidence зафиксированы в
[отчёте local preview promotion](../reports/ADMIN-AI-LOCAL-PREVIEW-PROMOTION-2026-08-22.md).

Применённый и runtime-проверенный результат adoption текущей local schema-push БД зафиксирован в
[отчёте migration adoption](../reports/MIGRATION-ADOPTION-2026-08-17.md).

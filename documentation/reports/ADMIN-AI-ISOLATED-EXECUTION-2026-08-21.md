# Admin AI: isolated execution foundation

## Результат

После exact plan approval Payload может создать durable code execution job.
Отдельный локальный worker выполняет job вне Next/Payload HTTP-процесса и не
изменяет основной checkout.

Реализованный поток:

1. `POST /api/realize-ai/changes/:id/execute` повторно проверяет owner,
   optimistic version, approval binding, expiration, path/check policy и Git
   base commit.
2. В PostgreSQL сохраняется job и только hash HMAC capability; bearer token,
   signing secret и локальный workspace path в browser DTO не попадают.
3. `npm run ai:execution-worker` claim-ит job через `FOR UPDATE SKIP LOCKED`,
   создаёт отдельную ветку/worktree и запускает ephemeral Codex App Server turn
   с `workspace-write`, `approvalPolicy=never`, отключёнными MCP/web/notify и
   server-initiated requests.
4. После turn worker сверяет HEAD, exact changed paths и symlinks, получает
   unified diff и запускает только server-owned checks без shell interpolation.
5. Admin видит status, base commit, branch, diff stat, bounded unified diff,
   check summaries и hashes.
6. `accept-implementation` или `reject-implementation` создаёт второе
   append-only решение, связанное с diff/evidence hash.

## Persistence

Миграция `20260821_194623_isolated_execution_worker` добавляет:

- расширенные Change Request states;
- тип `IMPLEMENTATION_ACCEPTANCE` и `diffHash` в approvals;
- `realize-ai-execution-jobs`;
- `realize-ai-check-results`.

Миграция применена к локальной retained БД; schema push не использовался.

## Security boundary

- feature flag `REALIZE_AI_EXECUTION_ENABLED` по умолчанию `false`;
- short-lived capability связан с change/job/version/plan/scope/base
  commit/paths/checks/nonce/expiry;
- platform owners, migrations, access/config, delivery/security и AI-layer
  защищены от первого code lane;
- основной checkout, Git remote, business data, MCP, install, commit, push и
  deploy не входят в capability;
- check commands выбираются сервером из фиксированного argv registry;
- raw capability, process environment и внутренний workspace path не входят в
  API DTO.

## Проверенное evidence

- Payload migration создана штатным generator и применена локально;
- Payload types и Admin import map обновлены штатными generators;
- integration tests покрывают DTO validation, HMAC tampering/expiry,
  protected paths, persistence shape и реальный временный Git worktree;
- browser fixture покрывает queue → completed evidence → implementation
  acceptance без запуска настоящего Codex job.
- execution-enabled API regression фактически создал durable queued job и
  затем удалил тестовые записи;
- idle execution worker подключился к PostgreSQL, не получил jobs и был штатно
  остановлен; live Codex code-execution job намеренно не запускался.
- локальный read-only control plane прошёл реальный Codex App Server smoke:
  SSE завершился `assistant.completed` с ожидаемым ответом `REALIZE_AI_OK`;
  workspace-write в этом smoke не выдавался.
- после delivery локально запущены PostgreSQL, Next/Payload, loopback control
  plane и idle execution worker; runtime tokens заданы только процессам и не
  записаны в репозиторий.

Delivery gate от 22 августа 2026 года:

- `npm run format:check` — pass;
- `npm run lint` — pass, 0 errors и 133 warnings в текущем репозитории;
- `npm run typecheck` — pass;
- `npm run test:int` — 10 test files и 33 tests passed;
- `npm run build` — pass, production Next.js build собран;
- `npm run test:e2e` — 3 browser tests passed;
- execution-enabled `admin-ai-change-api.e2e.spec.ts` — 1 test passed;
- `npm run payload:migrate:status` — все 5 миграций применены;
- `node scripts/security/check-secrets.mjs` — проверено 1112 versionable
  файлов, утечек не найдено;
- visual evidence вручную проверено на desktop и mobile:
  `evidence/admin-ai-chat-desktop.png` и
  `evidence/admin-ai-chat-mobile.png`.

`npm run verify:runtime` корректно завершился fail: рабочее окружение содержит
Node.js `24.13.0` и npm `11.6.2`, тогда как repository contract требует Node.js
`24.18.0` и npm `11.15.0`. Версии окружения в рамках этой задачи не изменялись.

## Осознанно не реализовано

- перенос принятого diff в основной checkout;
- commit/push, preview, independent reviewer, release/deploy и rollback;
- production central worker/container и tenant isolation;
- cancellation/retry/lease timeout recovery;
- TTL cleanup worktree/branch и external artifact storage;
- live Codex execution в verification этой задачи.

До появления этих слоёв текущий worker остаётся trusted local-development
foundation, а не завершённым Phase 3 или production механизмом.

# Admin AI: local preview promotion

## Результат

Реализован локальный vertical slice Phase 3 после отдельного принятия
implementation diff. Он не изменяет основной checkout и не выполняет push или
production deploy.

Фактический поток:

1. `POST /api/realize-ai/changes/:id/deploy-preview` повторно проверяет owner,
   optimistic version, implementation acceptance binding, expiration и exact
   non-truncated diff/evidence hashes.
2. Payload создаёт durable `realize-ai-deployments` job. Browser не получает
   workspace path, process ID, database name/URL или credentials.
3. Отдельный execution worker claim-ит job через `FOR UPDATE SKIP LOCKED`,
   создаёт чистый worktree от сохранённого base commit и byte-for-byte
   применяет принятый binary diff в index.
4. Worker повторно сверяет commit, paths, symlinks и staged diff hash, затем
   запускает server-owned security/format/lint/typecheck/tests/build checks с
   минимальным окружением без AI, signing и integration secrets.
5. Новый ephemeral Codex turn получает только read-only sandbox и независимо
   проверяет staged diff. Неоднозначный JSON, timeout, runtime failure или
   blocking finding fail-closed останавливает promotion.
6. После approval reviewer-а worker создаёт один service-identity commit и
   связывает artifact hash с commit, tree, source diff и Next build ID.
7. Worker создаёт отдельный sanitized PostgreSQL clone, запускает exact
   standalone Next build только на `127.0.0.1`, ждёт readiness и проверяет
   health/storefront настоящим Chromium.
8. Admin видит progress, commit/artifact/evidence hashes, checks, reviewer
   verdict, TTL и live preview URL. `accept-preview`/`reject-preview` создаёт
   отдельное hash-bound решение.
9. Rejection и TTL cleanup останавливают только доказанно принадлежащий
   worktree процесс, удаляют clone, runtime files, worktree и server-owned
   preview branch.

Дополнительно реализован канонический browser-safe
`GET /api/realize-ai/deployments/:id`.

## Persistence и контракты

Миграция `20260821_205949_local_preview_promotion` добавляет:

- preview states в Change Request;
- `PREVIEW_ACCEPTANCE`, artifact hash и target environment в approvals;
- hidden collection/table `realize-ai-deployments`;
- preview stages и deployment relation в check results;
- DB constraint, по которому check result принадлежит ровно одному owner:
  execution job или deployment.

Public DTO явно проецирует только безопасное evidence. Internal database URL,
database name, PID, worker ID и workspace ID остаются server-side.

## Security boundary

- `REALIZE_AI_PREVIEW_ENABLED` по умолчанию `false`;
- preview host фиксирован как `127.0.0.1`;
- promotion replay не запускает нового write-capable агента;
- reviewer не переиспользует implementation thread и не имеет write/MCP/web
  capabilities;
- accepted diff проверяется до и после применения и непосредственно перед
  commit;
- checks выбираются сервером из argv registry и не используют shell
  interpolation;
- preview получает новые Payload/preview secrets, AI выключен, внешние
  credentials не наследуются;
- clone очищает AI runtime records, auth sessions, carts/orders/transactions,
  addresses и form submissions, маскирует известные user/form email/auth
  поля;
- preview acceptance связан с source diff, commit, artifact, aggregate
  evidence, reviewer evidence, environment, actor, version и expiry.

## Проверенное evidence

- official Node.js `24.18.0` и npm `11.15.0` использованы из изолированного
  `/tmp` toolchain;
- `npm run verify:runtime` — pass на этой exact runtime pair;
- `npm run format:check` — pass;
- `npm run lint` — pass, 0 errors; repository-wide legacy warnings остаются;
- `npm run typecheck` — pass;
- `npm run test:int` — 15 test files и 41 tests passed; отдельные regression
  проверки покрывают cleanup standalone process после смены process title и
  материализацию real-directory `node_modules` с bounded cleanup;
- `npm run test:e2e` — 3 Chromium tests passed; drawer fixture прошёл полный
  queue → implementation acceptance → preview ready → reviewer/check evidence
  → preview acceptance сценарий, включая сохранение state после navigation и
  reload;
- `npm run build` — pass в основном checkout и в detached worktree от exact
  commit; standalone Next.js build создан;
- `npm run payload:migrate:status` — все 6 миграций применены;
- migration `down` и последующий `up` прошли на одноразовом clone, не затронув
  execution schema; owner constraint восстановлен;
- реальный DB clone smoke подтвердил пустые AI tables и отсутствие
  немаскированных email в проверяемом контуре;
- реальный standalone runtime поднялся на loopback с отдельным DB clone;
  readiness вернул `ready`, Chromium открыл health и storefront без Next
  overlay, title — `Главная`; process, clone и runtime files затем удалены;
- повторный runtime smoke после cleanup-fix подтвердил отсутствие listener на
  preview range, живого PID и `realize_ai_preview_%` database;
- реальный независимый Codex App Server reviewer в ephemeral read-only turn
  вернул строго распарсенный `approved`, 0 findings и 64-символьный evidence
  hash; временный worktree и subprocess закрыты;
- `node scripts/security/check-secrets.mjs` — проверено 1136 versionable
  файлов, утечек не найдено.
- desktop/mobile screenshots обновлены и визуально проверены:
  `evidence/admin-ai-chat-desktop.png` и
  `evidence/admin-ai-chat-mobile.png`; drawer не выходит за mobile viewport,
  preview URL/evidence/acceptance читаются в обеих компоновках.

## Реальный queue-to-preview проход

После tracked baseline `11e7edd0f5a436f5375972798742618b405b21c0`
выполнен настоящий approval-gated Change Request. Первый запуск выявил, что
Next.js 16/Turbopack запрещает внешний symlink `node_modules` из isolated
worktree. Fix `28387da3ffe57909516b210f053dbebf5309d96f` вынес dependency
materialization в отдельного owner-а: trusted check phase получает реальную
локальную директорию с copy-on-write попыткой и fallback-копированием, после
проверок она удаляется.

Повторный проход от base commit `28387da3ffe57909516b210f053dbebf5309d96f`
подтвердил:

- implementation agent изменил ровно `src/components/Header/index.tsx` и
  добавил только согласованный TSDoc без runtime-изменений;
- exact diff hash:
  `9fa73b36fc1cadeacc523a843a7f2caa4c057a3b55e2a1e4f07e2bd204ea3b3f`;
- 5 execution checks и 7 preview checks завершились со статусом `passed`;
- independent reviewer вернул `approved`; reviewer evidence hash:
  `b4fd08dda0f12811ee498b6582703a8601926cd65cc69b59315ab53a042c39da`;
- ephemeral service commit:
  `0979b9c4adab470ca6ac1fbacf20d9f01a3326cd`;
- local preview artifact hash:
  `3148a6c53a293df2696f5b179d10f40bdd94b6b3b10be5f2cb41ab5c587814b6`;
- state machine дошла до `preview_ready`, затем до отдельного
  `preview_accepted`;
- после принудительного test TTL worker остановил runtime и удалил DB clone,
  preview worktree и branch; тестовые user/change/deployment records,
  execution worktree/branch и detached app runtime также удалены;
- итоговая сверка показала 0 preview listener-ов, 0
  `realize_ai_preview_%` databases, 0 временных admin records и отсутствие
  `ai/change-*`/`ai/preview-*` branches.

## Осознанные ограничения

- это `local-git-preview`, а не OCI image/digest; Docker runtime в текущей
  среде отсутствует;
- нет удалённого preview hostname, network policy, central multi-tenant
  sandbox, external artifact storage, registry signing или production release;
- основной checkout и remote не изменяются; принятие preview не является
  release approval;
- sanitizer покрывает известную текущую schema, но при добавлении новых PII
  полей требует отдельного обновления и security review;
- local materialization временно занимает место размером до установленного
  dependency tree; production-контур должен заменить её OCI layer/cache и
  отдельным quota-aware cleanup controller.

Следующий production-oriented шаг: выбрать OCI preview orchestrator и добавить
release approval без переиспользования local Codex identity.

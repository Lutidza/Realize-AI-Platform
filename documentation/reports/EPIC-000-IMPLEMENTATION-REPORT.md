# Отчёт реализации: delivery baseline, Admin AI и approval-only slice

Дата: 2026-08-18  
Статус текущего пользовательского slice: `IMPLEMENTED AND LOCALLY VERIFIED`  
Статус полного Phase 0/Phase 1 master roadmap: `PARTIAL — см. ограничения`

## 1. Реализовано

### Пакет спецификации

- исходный master-файл превращён в стабильный canonical entrypoint;
- нормативный текст разложен в обязательном порядке чтения и реализации на
  80 Markdown-файлов: 70 leaf-разделов и 10 навигационных `INDEX.md`;
- каждый из 70 leaf-разделов сверён с пользовательской staged-копией:
  68 являются точными normalized source slices, в двух изменена только
  формулировка внутренних ссылок после перехода от одного файла к пакету;
- проверены все 102 Markdown-файла `documentation/**`: broken local links нет.

### Runtime и delivery

- exact target: Node `24.18.x`, npm `11.15.x`, `.nvmrc`, `.node-version`,
  engine/package-manager gate;
- npm workspaces и единый lockfile;
- Payload production migrations и запрет schema push в production;
- schema push является явным opt-in только для disposable local DB; retained и
  adopted development DB по умолчанию работают migration-only;
- fail-closed adoption pipeline для существующей schema-push БД с backup,
  restore, semantic comparison и clone no-op proof;
- liveness/readiness endpoints;
- non-root read-only standalone Docker runtime, Compose с PostgreSQL и
  persistent media/database volumes;
- GitHub CI, GHCR release image, SBOM/provenance, pinned vulnerability scan,
  staging deployment, approved production promotion и manual rollback;
- exact-digest deployment с lock, pre-migration backup, one-shot migration,
  readiness и automatic application rollback.

### Payload Admin AI

- workspace contracts, approval-only change-engine policy, Codex App Server
  adapter и Payload config transformer;
- глобальный provider и адаптивный drawer на всех страницах Payload Admin,
  custom `/admin/ai` view и nav link без изменения generated Payload pages;
- шесть hidden collections: conversations, messages, runs, run events, change
  requests и append-only approvals;
- Payload auth/admin access, rate limit, idempotency, ownership checks,
  correlation IDs, DTO mappers и recursive secret redaction;
- hidden runtime collections fail closed для standard Payload REST;
  browser получает только allowlisted DTO через plugin endpoints;
- conversation/message/run/status/cancel endpoints;
- create/get Change Request и hash-bound plan approve/reject endpoints с
  optimistic versioning и idempotency;
- authenticated SSE bridge с persisted replay и `Last-Event-ID`;
- Admin client показывает подключение, анализ, elapsed time и reconnect;
  durable `GET /runs/:id` polling завершает UI даже при потерянном terminal SSE,
  а sequence deduplication не удваивает delta после ручного retry;
- race-safe идемпотентное сохранение одинаковых событий при параллельном SSE
  reconnect с fail-closed проверкой полного event envelope;
- Context Pack с allowlist, hashes, size limits, binary/secret/symlink excludes;
- loopback-only development control plane с bearer auth;
- UI readiness проверяет аутентифицированный control-plane status;
- Codex adapter блокирует file changes, MCP и dynamic tools.
- отдельная approval card показывает exact scope, checks, hashes, risk и
  expiration; plan approval не запускает выполнение, execute endpoint
  отсутствует.

## 2. Проверки

| Проверка | Результат |
| --- | --- |
| Clean install целевым npm `11.15.0` | PASS, 852 packages; host Node `24.13.0` |
| PostgreSQL 17 migrations | PASS: все 4 migrations имеют `Ran=Yes`; approval migration — batch 2 |
| Production build с migrated DB | PASS |
| Standalone server + live/ready | PASS |
| Production build с недоступной DB | PASS; build не зависит от target DB |
| Portable client bundle | PASS: пустые runtime public URL/Stripe, без `undefined/api` и baked localhost API |
| Specification split integrity | PASS: 70/70 leaf-разделов, 80 файлов пакета, 0 broken local links |
| TypeScript | PASS |
| Integration tests | PASS, 8 files / 29 tests |
| Existing DB adoption | PASS: verified backup/restore, clone/reference semantic equality, guarded target history transaction, migration no-op и restart без dev marker |
| Playwright browser/API suite | PASS, 3 tests: health, global drawer/recovery и durable approval API |
| Control-plane auth/readiness probe | PASS: live 200, unauthenticated 401, authenticated 200 |
| Real Admin chat browser flow | PASS, включая reload/SSE resume |
| Checkout без Stripe | PASS: HTTP 200, явное disabled-state сообщение, 0 browser console errors |
| Generated Payload types/import map | PASS, повторная генерация без drift |
| Scoped Prettier | PASS |
| Targeted ESLint | PASS, 0 warnings/errors |
| Whole-repository ESLint | PASS с 129 warnings, 0 errors; target scope — 0 warnings/errors |
| Secret scan | PASS, 1044 versionable files |
| Dependency gate | PASS: 0 critical, 0 high; 6 moderate, 1 low |
| Shell syntax | PASS |
| Compose/GitHub YAML parse | PASS, 5 files |
| Working-tree `git diff --check` | PASS |

Database-free build всё ещё пишет один пойманный Payload/PostgreSQL error во
время framework metadata collection, но завершает сборку с code 0 и формирует
standalone output. В тесте использован заведомо недоступный адрес, поэтому
доступ к environment database не происходил.

Docker CLI/daemon в текущей среде отсутствует. Поэтому `docker build` и
`docker compose config/up` фактически не запускались; standalone layout,
runtime startup и YAML проверены без Docker.

Пользовательская staged-копия исходного master-файла содержит 16 Markdown
hard-break строк с двумя пробелами в конце, поэтому отдельный
`git diff --cached --check` возвращает замечания. Рабочая версия canonical
entrypoint и весь созданный unstaged diff проходят `git diff --check`; index
не перезаписывался и не перестейдживался без запроса пользователя.

Локальный host имеет Node `24.13.0` и системный npm `11.6.2`, поэтому exact
`verify:runtime` ожидаемо не проходит на host. Целевая пара Node `24.18.0` / npm
`11.15.0` закреплена в Dockerfile и GitHub Actions; lockfile и clean install
проверены через npm `11.15.0`. Compose target PostgreSQL `15.18` также будет
проверен только там, где доступен Docker; локальная fresh-DB проверка выполнена
на установленной PostgreSQL `17`.

## 3. Browser evidence

- [Desktop 1440](evidence/admin-ai-chat-desktop.png)
- [Mobile 390](evidence/admin-ai-chat-mobile.png)

Актуальные screenshots показывают глобальный responsive drawer и отдельную
карточку утверждённого плана. Реальный Codex run ответил на вопрос о текущем root package, события прошли
через control plane → Payload SSE → browser. После перезагрузки страницы UI
восстановил активный stream и показал terminal state. Mobile viewport не имеет
horizontal overflow.

Отдельный детерминированный Chromium regression обрывает SSE после
`run.started` и `assistant.delta`, не отправляет terminal event, выполняет
ручной retry с replay и переводит durable run в `completed` только через
`GET /runs/:id`. UI не дублирует delta, загружает persisted assistant message и
показывает тот же ответ после reload; временный Payload admin удаляется.

Отдельная regression-проверка конкурентного reconnect выполнена в двух
одновременно открытых Admin-вкладках. Оба SSE bridge к одному run завершились
с HTTP `200` после terminal cancel; в durable projection записана непрерывная
последовательность `1…2218`, все 2218 `eventID` уникальны, server-side
`AI SSE bridge failed` и browser console errors отсутствуют. Временные user,
conversation, message, run и event records после проверки удалены.

## 4. Documentation и code-comment gates

```text
canonical_documentation_gate: passed
contract_level_change: yes
affected_contract: delivery, migrations, Payload plugin, DTO/API/SSE, AI runtime
nearest_canonical_doc: documentation/specifications/realize-ai-commerce/v1.0/**
canonical_doc_decision: existing_doc_found
documentation_sync_required: yes
documentation_sync_scope: in_scope
docs_sync_debt: foreign/stale AI-layer artifacts require a separate cleanup task
blocker: none for the implemented local slice
```

```text
code_comment_discipline_check: passed
changed_code_files: scoped implementation and boundary files
header_required: yes for new/boundary source files
header_updated: yes
docref_decision: omitted instead of inventing links
docref_absent_reason: active rule incorrectly requires missing docs/** contour; canonical docs live in documentation/** and the conflict is audited
public_api_comments_required: yes
public_api_comments_updated: yes for public contracts/adapters/plugin/runtime boundaries
canonical_documentation_gate: passed
documentation_sync_required: yes, completed in current scope
blocker: none
```

## 5. Что не считается завершённым

- Полный Phase 0 acceptance не заявлен: root README и отсутствующие AI workflow
  specs не восстановлены, полный storefront/admin/checkout test matrix не
  реализован, Docker image не собран в доступном daemon.
- Полный Phase 1 не заявлен: development control plane использует in-memory run
  store; durable central queue, isolated worker fleet и production service
  identity отсутствуют.
- Локальный Codex worker допустим только для доверенного admin на
  development workstation; это не production tenant-isolation boundary.
- Агент остаётся строго read-only. Реализовано только сохранение и решение по
  plan approval; catalog/content/code execution, preview, deployment и rollback
  из чата отсутствуют.
- Existing schema-pushed database adopted: все четыре named migrations имеют
  `Ran=Yes`; restart подтверждён без `dev/-1`.
- Production deployment требует GitHub environments, GHCR/VPS credentials,
  domain/TLS/reverse proxy и central control-plane URL/token.
- Stripe checkout не активирован в текущем immutable image: нужен
  runtime public-config contract для publishable key без environment-specific
  rebuild.
- AI-layer audit завершился `FAILED`; находки перечислены в
  `AI-LAYER-FOREIGN-ARTIFACT-AUDIT.md` и намеренно не исправлялись скрытой
  массовой заменой.

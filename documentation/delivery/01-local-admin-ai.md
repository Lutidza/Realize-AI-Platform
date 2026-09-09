# Локальный запуск и чат в Payload Admin

- **Статус:** current implementation runbook
- **Дата сверки:** 9 сентября 2026 года

Этот runbook описывает существующий e-commerce baseline. Capability/config
foundation, hidden Payload persistence и aggregate Config API уже реализованы.
`/admin/ai/settings`, activation и подключение active release к chat runtime
ещё отсутствуют.

## 1. Требования

- Node.js `24.18.x`;
- npm `11.15.x`;
- PostgreSQL;
- установленный Codex CLI и включённое подключение Codex в Admin для чата;
- для code execution — отдельный локальный workspace root вне репозитория;
- секреты только в локальном `.env`, который не коммитится.

Проверка toolchain:

```bash
npm run verify:runtime
npm ci
```

## 2. Конфигурация

Скопируй `.env.example` в `.env` и замени placeholder-значения. Для локального
чата обязательны:

```dotenv
REALIZE_AI_ENABLED=true
REALIZE_AI_RUNTIME_MODE=local-development
REALIZE_AI_CONTROL_PLANE_TOKEN=<случайное значение длиной не менее 32 символов>
REALIZE_AI_CONTROL_PLANE_URL=http://127.0.0.1:3100
```

Изолированный code worker включается отдельно и по умолчанию выключен:

```dotenv
REALIZE_AI_EXECUTION_ENABLED=true
REALIZE_AI_EXECUTION_SIGNING_SECRET=<отдельное случайное значение не короче 32 байт>
REALIZE_AI_EXECUTION_WORKSPACE_ROOT=/absolute/path/outside/repository
```

Для write-only credentials раздела `/admin/integrations` site runtime и
execution worker должны получить один installation-owned master key. Для
локального запуска его можно хранить в ignored `.env.local`; control plane и worker читают
сначала этот файл, затем `.env`, не перезаписывая уже переданное process env:

```dotenv
REALIZE_INTEGRATIONS_ENCRYPTION_KEY=<результат openssl rand -base64 32>
```

Payload secret не используется как fallback. После сохранения GitHub token
прочитать через Admin/API нельзя: можно только проверить подключение, заменить
credential или отключить интеграцию.

Promotion принятого diff в локальный preview включается третьим независимым
feature flag:

```dotenv
REALIZE_AI_PREVIEW_ENABLED=true
REALIZE_AI_PROMOTION_WORKSPACE_ROOT=/absolute/path/outside/repository/promotion-worktrees
REALIZE_AI_PREVIEW_ROOT=/absolute/path/outside/repository/preview-runtimes
REALIZE_AI_PREVIEW_HOST=127.0.0.1
REALIZE_AI_PREVIEW_PORT_MIN=3200
REALIZE_AI_PREVIEW_PORT_MAX=3299
REALIZE_AI_PREVIEW_TTL_SECONDS=21600
```

`REALIZE_AI_REVIEW_MODEL` и timeout независимого reviewer-а можно задать
отдельно. Reviewer использует server-side Codex identity и всегда получает
read-only sandbox.

Публикация принятого preview commit в GitHub включается отдельным feature flag.
Git executable и timeout остаются operator-owned configuration:

```dotenv
REALIZE_AI_SOURCE_PROMOTION_ENABLED=true
REALIZE_AI_GITHUB_GIT_COMMAND=/usr/bin/git
REALIZE_AI_SOURCE_PROMOTION_TIMEOUT_MS=120000
```

Перед запуском нужно сохранить, включить и успешно проверить GitHub connection
в `/admin/integrations`. Repository-scoped token должен иметь
`contents:write` и `pull_requests:write`; права GitHub Actions для этого lane не
нужны.

`REALIZE_AI_WORKSPACE_ROOT` указывает на Git repository root, а
`REALIZE_AI_EXECUTION_WORKSPACE_ROOT` — на владельца временных execution
worktree. Promotion worktree и preview runtime roots также находятся вне
репозитория и не должны пересекаться с ним или друг с другом.

Все site/Payload URL должны указывать на один фактический origin браузера.
Например, если Admin открыт на `http://localhost:3000`, не смешивай его с
`http://127.0.0.1:3000`: Payload CSRF проверяет origin.

Подключите GPT — Codex в `/admin/integrations/codex`: доступны вход ChatGPT
через браузер или код устройства, API key, Codex access token и workload identity.
Для кода устройства разрешите этот способ в настройках безопасности ChatGPT.
API оплачивается отдельно от подписки; корпоративным способам нужны права
рабочего пространства и соответствующая серверная настройка. Сохранённые
секреты не выдаются через Admin/API. Порядок и условия всех способов — в
[архитектуре интеграции](../architecture/codex-integration.md#авторизация).

Next/Payload, control plane и worker должны видеть одну БД и постоянный
`REALIZE_CODEX_STATE_ROOT` (абсолютный путь вне репозитория). Для способов
с сохраняемым секретом также нужен общий master key; workload identity
использует отдельную серверную настройку без vault.
При пустом значении используется `~/.local/share/realize-ai-cms/codex`.
Codex CLI берётся из `PATH` либо из `REALIZE_CODEX_BINARY`. Подключение из Admin
обязательно для запуска CMS; личная авторизация `~/.codex` не используется.
Ограничения описаны в [архитектуре интеграции](../architecture/codex-integration.md).

## 3. База данных

Если Docker доступен, только PostgreSQL можно поднять отдельно:

```bash
docker compose up -d postgres
npm run payload:migrate
npm run payload:migrate:status
```

Для уже существующей schema-pushed базы сначала выполни процедуру adoption из
[раздела о миграциях](03-migrations-and-rollback.md). Не запускай baseline
миграцию непосредственно на production без восстановленной тестовой копии.

`PAYLOAD_DB_PUSH=false` должен оставаться значением по умолчанию для retained и
adopted БД. `PAYLOAD_DB_PUSH=true` допускается только для disposable local DB,
которую можно полностью пересоздать; после adoption такой режим запрещён.

## 4. Процессы разработки

В первом терминале:

```bash
npm run ai:control-plane
```

Control plane намеренно разрешает bind только на `127.0.0.1` или `::1`,
принимает bearer token, создаёт ограниченный Context Pack и запускает Codex в
read-only sandbox. MCP, dynamic tools и file changes заблокированы adapter-ом.

Это development boundary для доверенного локального admin, а не
production tenant isolation. Не запускай его на workstation с чужими
credentials для недоверенных админов. Production требует центральный
изолированный worker с отдельной service identity.

Во втором терминале:

```bash
npm run ai:execution-worker
```

Этот процесс нужен при включённом code execution, local preview, source
promotion или release. Он poll-ит durable PostgreSQL queues, атомарно claim-ит
одну задачу и никогда не запускается внутри Next/Payload HTTP request. Перед
выдачей `workspace-write` он проверяет HMAC capability, exact
plan/scope/version/base commit и expiration. Promotion не выдаёт
write-capability новому агенту: worker воспроизводит уже принятый diff, а
отдельный reviewer работает read-only.

В третьем терминале:

```bash
npm run dev
```

Затем войди администратором Payload. На любой странице `/admin/**` доступна
плавающая кнопка `Realize AI`, которая открывает боковой drawer. Полноэкранный
вариант того же интерфейса доступен по адресу:

```text
http://localhost:3000/admin/ai
```

Каталог внешних подключений доступен отдельно:

```text
http://localhost:3000/admin/integrations
```

GitHub adapter принимает canonical HTTPS repository URL. Кнопка «Проверить»
делает server-side GitHub REST request; browser не вызывает GitHub напрямую.

## 5. Ожидаемое поведение

- чат виден только Payload-пользователю с ролью `admin` и сохраняет выбранный
  диалог при переходах между страницами Admin;
- один provider обслуживает drawer и полноэкранный `/admin/ai`, поэтому второй
  параллельный chat state не создаётся;
- сообщения, события, Change Requests, Data Operations, hash-bound decisions,
  transactional outbox, execution jobs, deployments, integration settings/audit,
  installation config drafts/releases/events и check results сохраняются в
  скрытых Payload collections;
- browser получает только DTO/envelope, не raw Payload documents;
- automatic SSE reconnect использует `Last-Event-ID`, а полная
  перезагрузка UI восстанавливает active run через persisted replay;
- до первого фрагмента UI явно показывает подключение/анализ и прошедшее время;
  при разрыве stream показывает восстановление связи и кнопку ручного retry;
- потерянный terminal SSE не оставляет composer заблокированным: UI сверяет
  active run через `GET /runs/:id`, сохраняет live-текст до загрузки durable
  conversation detail и затем показывает persisted assistant message;
- параллельные SSE-подключения к одному run сохраняют совпадающее событие
  идемпотентно: проигравший конкурентную вставку bridge продолжает поток, а
  совпавший `eventID` с другим envelope считается ошибкой идентичности;
- завершённый ответ с точными project paths можно оформить как отдельный
  Change Request; карточка показывает risk level, scope, проверки, hashes и
  expiration;
- ответ с поддерживаемым catalog intent можно оформить как отдельную Data
  Operation; в текущем slice разрешено только добавить одну существующую
  категорию одному существующему товару;
- dry-run строится Payload-ом из актуальных документов и показывает категории
  до/после; browser и модель не передают готовый patch или raw document;
- apply доступен только после подтверждения exact operation hash и версии,
  выполняется через Payload Local API с access, hooks, транзакцией и
  optimistic lock; approval и результат сохраняются в audit/outbox;
- rollback является отдельным compensating действием: admin подтверждает exact
  rollback hash, после чего Payload восстанавливает before-snapshot, если
  applied version товара не устарела;
- admin может отдельно утвердить или отклонить конкретную версию плана;
  approval криптографически привязан к plan/scope/version/actor/expiration;
- после approval доступный code/theme scope можно поставить в durable очередь;
  endpoint возвращает управление без запуска Codex в HTTP-процессе;
- worker создаёт отдельную ветку и worktree от зафиксированного `HEAD`, поэтому
  незакоммиченные изменения основного checkout в job не попадают;
- для trusted check phase worker материализует установленный `node_modules` как
  реальную локальную директорию worktree и удаляет её после проверок; внешний
  symlink не используется, потому что Next.js 16/Turbopack отклоняет build,
  выходящий за filesystem root проекта;
- protected owner layers (`.ai`, `.codex`, platform packages/services,
  migrations, Payload config/access и delivery/security scripts) блокируются;
- после Codex worker повторно сверяет фактические changed paths, запрещает
  symlink/out-of-scope diff, выполняет только команды из server registry и
  сохраняет bounded unified diff, hashes и check evidence;
- фактический результат требует второго implementation acceptance, связанного
  с diff/evidence hash;
- после implementation acceptance admin может отдельно создать local preview:
  worker byte-for-byte применяет сохранённый diff к его base commit, повторяет
  security/format/lint/typecheck/tests/build, запускает новый ephemeral
  read-only reviewer и только после его approval создаёт service commit;
- preview использует exact standalone build, новый sanitized DB clone,
  loopback URL и Playwright/Chromium smoke; URL показывается только после
  readiness и успешного smoke;
- artifact/commit/reviewer/check hashes доступны в карточке Change Request;
  принятие или отклонение preview является отдельным hash-bound решением;
- rejection и TTL очищают process, DB clone, worktree и server-owned branch,
  пока execution worker запущен;
- preview acceptance сама не применяет commit в основной checkout, не выполняет
  push и не запускает production deploy;
- отдельное действие «Опубликовать draft PR» ставит source promotion в durable
  queue; worker публикует exact commit только в `ai/changes/**`, проверяет
  remote ref и создаёт open draft Pull Request без merge authority;
- недоступный control plane отображается как явная ошибка, а не успешная
  заглушка.

Локальный chat run store control plane находится в памяти. Перезапуск процесса
прерывает незавершённые chat runs. Code execution queue хранится в PostgreSQL,
а promotion worktree, runtime и DB clone являются локальными артефактами
конкретного worker host.

Текущий local worker предназначен только для доверенного разработчика: он не
является multi-tenant sandbox и использует локальную Codex identity. Sanitizer
покрывает известные auth/session/order/address/form контуры, но не заменяет
организационный аудит всех будущих PII-полей. Production требует ephemeral
container/VM, отдельную service identity, lease recovery, external artifact
storage, OCI image/digest, сетевую preview-изоляцию и production-grade cleanup
controller.

## 6. Проверка Config API до появления Settings UI

Authenticated admin bootstrap доступен через
`GET /api/realize-ai/config`. Mutation endpoints требуют заголовок
`Idempotency-Key` длиной 8–128 символов и strict body с
`schemaVersion: "1.0"`:

1. `POST /api/realize-ai/config/drafts` создаёт editing draft с
   `expectedRevision: 0`.
2. `PUT /api/realize-ai/config/drafts/:id` полностью заменяет artifacts по
   exact revision; новый artifact имеет revision 1, изменённый повышает её на
   один.
3. `POST /api/realize-ai/config/validate` проверяет exact draft/system manifest
   и только при success переводит draft в `ready`.
4. `POST /api/realize-ai/config/releases` требует ready revision и
   `expectedSystemManifestHash` из bootstrap, после чего создаёт immutable
   release.
5. `GET /api/realize-ai/config/releases/:id` возвращает verified full snapshot.

Эти endpoints не активируют release и не изменяют `.ai/.codex`. Для ручных
запросов используй same-origin authenticated browser session; не добавляй
Payload cookies или секреты в shell history и документацию.

## 7. Ручная проверка Data Lane

1. Открой `/admin/ai` под пользователем с ролью `admin`.
2. Попроси добавить существующую категорию существующему товару, указав
   однозначный `id`, `slug` или `title` обоих документов.
3. Нажми «Шаг 1 · Подготовить изменение данных» и сверь блоки «До» и «После».
4. Нажми «Шаг 2 · Подтвердить vN», а затем отдельно
   «Шаг 3 · Применить». Сообщение «подтверждаю» в чате не заменяет
   hash-bound подтверждение exact версии в карточке.
5. Убедись, что карточка перешла в «Применено», а категория появилась у товара.
6. Для проверки восстановления отдельно подтверди и выполни откат; карточка
   должна перейти в «Откат выполнен», а набор категорий — совпасть с исходным.

Не используй этот lane для production-данных до появления production tenant
isolation и operational policy. Неоднозначные selectors, уже назначенная
категория, stale document version и отсутствие Payload access завершаются
fail-closed без записи.

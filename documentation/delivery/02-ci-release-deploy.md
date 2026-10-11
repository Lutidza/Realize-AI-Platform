# CI, release и выкладка

- **Статус:** current implementation runbook
- **Дата сверки release manifest:** 4 октября 2026 года

`RELEASE_APPROVAL` текущего AI lane не связан с production job. Ни один шаг
ниже не следует трактовать как реализованный approval-bound production
controller.

## 1. CI

`.github/workflows/ci.yml` запускается для pull request, push в `main` и как
reusable workflow. Порядок gates:

1. exact Node/npm и `npm ci`;
2. secret scan и `npm audit --audit-level=high`;
3. миграции на чистой PostgreSQL;
4. formatting, lint, typecheck, integration tests и production build;
5. повторная генерация Payload types/import map с проверкой drift;
6. Playwright smoke tests.

CI-сборка использует только временную PostgreSQL и тестовый Payload secret.

## 2. Release image

`.github/workflows/release.yml` после зелёного CI:

1. собирает `linux/amd64` image;
2. публикует его в `ghcr.io/<owner>/realize-e-commerce`;
3. формирует SBOM и provenance;
4. сканирует опубликованный digest на исправимые `HIGH`/`CRITICAL`
   уязвимости;
5. сохраняет release manifest;
6. передаёт один и тот же immutable digest в staging и production.

Mutable tag `latest` не является единицей promotion. Deployment script
принимает только `ghcr.io/...@sha256:<64 hex>`.

Выпуск также содержит [контракт версий платформы](04-platform-versioning.md):
source inventory, exact hashes компонентов, порядок миграций, Git provenance и
сопоставление установленного состояния. `release.yml` публикует только из `main`;
право записи packages ограничено image job. Node/npm и trusted dependencies для
manifest закреплены отдельно от сборки Docker. Проверка совместимости пока не
подключена к production deploy controller; это самостоятельный этап roadmap.

## 2.1. GitHub draft Pull Request

После hash-bound preview acceptance admin может вызвать
`POST /api/realize-ai/changes/:id/publish-pull-request`. Endpoint проверяет
optimistic version, exact preview artifact/commit, tested GitHub connection и
только создаёт durable `SourcePromotion`. Статус читается через
`GET /api/realize-ai/source-promotions/:id`.

Execution worker повторно проверяет source hashes и снимок
repository/default-branch/integration revision, затем без force push публикует
exact commit в `ai/changes/<change-id>-<key>` и идемпотентно создаёт open draft
Pull Request. Token существует только в worker memory/`GIT_ASKPASS`; raw GitHub
response и credential в Payload/DTO не сохраняются. `main`, основной checkout,
merge и production при этом не изменяются.

Разрешение «Публикация Pull Request» включается в Admin → Интеграции →
GPT — Codex → Агент. Ниже остаются только параметры серверного исполнителя:

```dotenv
REALIZE_AI_GITHUB_GIT_COMMAND=/usr/bin/git
REALIZE_AI_SOURCE_PROMOTION_TIMEOUT_MS=120000
```

GitHub token должен быть ограничен выбранным repository и иметь
`contents:write` и `pull_requests:write`. Права Actions требуются только
независимому release adapter-у. Локальные проверки не выполняют реальный push и
не создают Pull Request.

## 2.2. Admin release gate

После принятия local preview Payload может создать отдельный
`ReleaseCandidate`. Server-owned execution worker вызывает настроенный
`REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND` без shell, передаёт JSON через
`stdin/stdout` и раскрывает executable только переменные из
`REALIZE_AI_RELEASE_ORCHESTRATOR_ENV_JSON`.

Перед созданием нового кандидата карточка и API проверяют свежий heartbeat
исполнителя с capability `release`. Готовый или занятый исполнитель позволяет
поставить задание в очередь; отсутствие подходящего исполнителя возвращает
причину до создания записи. Повтор уже созданного кандидата остаётся
идемпотентным, даже если исполнитель позднее отключился.

Если ранее созданный кандидат остался `queued`, а диагностика сообщает,
что исполнители не принимают задания этапа, сборка ещё не начиналась.
Проверьте разрешение release в интеграции и наличие
`REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND` у execution worker. Таймаут
orchestrator действует после получения задания и не ограничивает время
ожидания в очереди. Для адаптера GitHub также нужны исполняемые `gh`/`git`
и инфраструктура из разделов ниже; одного включённого переключателя
в админке недостаточно.

Для просмотра фронтенд-референса достаточно принятого local preview.
OCI-release — отдельная подготовка подписанного образа и внешнего HTTPS
preview; этот этап не подключает референс к основному локальному приложению.

Кандидат переходит в `awaiting_release_approval` только когда exact commit
подтверждён immutable OCI digest/ref, manifest hash, SBOM digest, verified
signature, migration-set hash и healthy HTTPS OCI preview. Admin approval
связывается с exact evidence и не запускает production deployment.

Текущий `.github/workflows/release.yml` не является adapter-ом этой очереди:
он не регистрирует candidate в Payload, а production job не проверяет
`RELEASE_APPROVAL`. Для release queue используется отдельный
`.github/workflows/prepare-release-candidate.yml`, в котором production job
отсутствует.

JSON-port принимает через `stdin` один объект `schemaVersion: 1` с
`candidateKey`, `changeRequestID`, exact `gitCommit`, `repositoryRoot`, hashes
исходного preview/acceptance, `targetEnvironment: production` и `expiresAt`.
Успешный `stdout` обязан содержать один JSON-объект со следующими полями:

- тот же `schemaVersion` и `gitCommit`;
- `imageRef` по immutable digest и `imageDigest` в формате `sha256:<64 hex>`;
- `manifestHash`, `sbomDigest`, `signatureRef` и
  `signatureVerified: true`;
- `migrations[]` с `id`, checksum и только direction `up`, а также
  `migrationSetHash`;
- `configVersion`, непустой `pluginVersions`, `provenanceRef` и optional
  `orchestratorReference`;
- HTTPS `previewURL`, `previewStatus: healthy` и bounded `healthSummary`.

Любой non-zero exit, timeout, иной commit, unsigned result, invalid hash или
unhealthy preview завершает candidate fail-closed. `stderr` не сохраняется и
не попадает в Admin API.

### 2.2.1. GitHub adapter worker

Server-owned executable —
`scripts/release/github-release-orchestrator.mjs`. Он:

1. проверяет JSON request до network side effect;
2. публикует exact commit только в
   `ai/release-candidates/<candidate-key>` без локальных Git hooks;
3. идемпотентно находит или запускает workflow по exact candidate key;
4. ждёт successful correlated run и скачивает artifact по exact run ID;
5. сверяет candidate key, commit и три source hash перед возвратом JSON worker-у.

На worker host нужны absolute paths к `node`, `git` и `gh`. Repository и token
настраиваются через `/admin/integrations`; token должен быть scoped к одному
repository и иметь `contents:write`, `pull_requests:write` для source promotion
и `actions:read/write` для release dispatch/evidence. Он хранится как write-only
AES-256-GCM envelope, для которого site runtime и worker получают общий
operator-owned `REALIZE_INTEGRATIONS_ENCRYPTION_KEY`.

`GH_TOKEN` и `REALIZE_AI_GITHUB_REPOSITORY` остаются bootstrap fallback для
инсталляций, где Admin connection ещё не создан. Остальные server-owned
параметры adapter-а задаются environment:

```dotenv
REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND=/absolute/path/to/node
REALIZE_AI_RELEASE_ORCHESTRATOR_ARGS_JSON=["/absolute/repository/scripts/release/github-release-orchestrator.mjs"]
REALIZE_AI_RELEASE_ORCHESTRATOR_ENV_JSON=["REALIZE_AI_GITHUB_GH_COMMAND","REALIZE_AI_GITHUB_GIT_COMMAND","REALIZE_AI_GITHUB_POLL_MS","REALIZE_AI_GITHUB_RUN_TIMEOUT_MS","REALIZE_AI_GITHUB_WORKFLOW","REALIZE_AI_GITHUB_WORKFLOW_REF"]
REALIZE_AI_RELEASE_TIMEOUT_MS=7200000
REALIZE_INTEGRATIONS_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
REALIZE_AI_GITHUB_WORKFLOW_REF=main
REALIZE_AI_GITHUB_GH_COMMAND=/usr/bin/gh
REALIZE_AI_GITHUB_GIT_COMMAND=/usr/bin/git
```

### 2.2.2. Release-preview environment

Создай GitHub environment `release-preview`, отдельный от `staging` и
`production`. Secrets:

- `PREVIEW_DEPLOY_HOST`;
- `PREVIEW_DEPLOY_USER` — scoped SSH account;
- `PREVIEW_DEPLOY_PORT` — optional, default 22;
- `PREVIEW_DEPLOY_PATH` — dedicated safe absolute host path, оканчивающийся на
  `/realize-release-previews`;
- `PREVIEW_DEPLOY_SSH_KEY`;
- `PREVIEW_DEPLOY_KNOWN_HOSTS` — pinned host key, не runtime `ssh-keyscan`.

Environment variables:

- `REALIZE_INSTALLATION_ID`;
- `PREVIEW_BASE_DOMAIN` — wildcard DNS domain;
- `PREVIEW_PORT_MIN` и `PREVIEW_PORT_MAX` — firewall-approved HTTPS port pool.

Scoped host account должен иметь уже настроенный GHCR `packages:read`
credential для `docker compose pull`; registry token не передаётся через SSH и
не хранится в repository. В `${PREVIEW_DEPLOY_PATH}/shared` operator заранее
создаёт:

```text
.env                         # PAYLOAD_SECRET и PREVIEW_SECRET
auth/.htpasswd               # Basic Auth для всех preview routes
database/sanitized.dump      # custom-format PostgreSQL dump без PII/tokens
media/                       # sanitized read-only media snapshot
tls/fullchain.pem            # trusted wildcard certificate
tls/privkey.pem              # private key, доступный только scoped host account
```

Каждый candidate получает отдельный Compose project, PostgreSQL volume,
hostname/HTTPS port и expiry. Candidate app и PostgreSQL находятся только во
внутренней backend network; Nginx также подключён к обычной frontend network и
один публикует HTTPS port. Поэтому app не имеет внешнего gateway, а AI и Stripe
secrets ему не выдаются. Workflow
`cleanup-release-previews.yml` каждый час удаляет просроченные projects и
volumes.

## 3. GitHub environments и secrets

Создай environments `staging` и `production`. Для production настрой required
reviewers. В каждом environment нужны:

- `DEPLOY_HOST`;
- `DEPLOY_USER` — отдельный scoped SSH user;
- `DEPLOY_PORT` — можно не задавать для порта 22;
- `DEPLOY_PATH` — абсолютный каталог deployment;
- `DEPLOY_SSH_KEY`;
- `DEPLOY_KNOWN_HOSTS` — заранее проверенный host key, не результат runtime
  `ssh-keyscan`.

На target host должны быть Docker Engine, Compose plugin, `flock`, свободное
место для image/backup и доступ к GHCR. Для private package выполни scoped
`docker login ghcr.io` вне deployment script.

## 4. Подготовка VPS

В `DEPLOY_PATH` заранее создай защищённый `.env` на основе `.env.example`.
Минимально нужны PostgreSQL credentials, `COMPOSE_DATABASE_URI`,
`PAYLOAD_SECRET`, `PREVIEW_SECRET` и canonical public URL. Файл `.env` не
передаётся из CI.

Web и PostgreSQL публикуются только на loopback. TLS/reverse proxy и DNS должны
быть настроены отдельно. Для production AI укажи HTTPS central control-plane
URL и service token; локальный loopback service не является production
решением.

## 5. Promotion

- push в `main` автоматически публикует image и выкладывает staging;
- production запускается только вручную через `workflow_dispatch` с
  `deploy_production=true` и после GitHub Environment approval;
- deployment делает backup, применяет migrations one-shot контейнером,
  переключает web на exact digest и ждёт `/api/health/ready`;
- при failed readiness автоматически возвращается предыдущий image digest
  и тоже проходит readiness; failed candidate сохраняется как
  `.release/failed.env` и не становится rollback-целью.

`/api/health/live` подтверждает работу процесса. `/api/health/ready`
дополнительно выполняет короткий запрос к Payload/PostgreSQL.

## 6. Ограничения текущего baseline

- Dockerfile/Compose прошли статические проверки, но локально не запускались:
  Docker CLI/daemon отсутствует в текущей среде;
- baseline `release.yml` не подписывается keyless-подписью; отдельный candidate
  workflow подписывает и сразу проверяет exact digest через Cosign/GitHub OIDC;
- media и PostgreSQL остаются single-host volumes;
- нет central secrets manager, multi-host orchestration и production central
  AI worker service.
- provider-neutral release queue, GitHub/GHCR adapter и VPS Compose preview
  реализованы, но по умолчанию выключены до operator configuration и не были
  runtime-проверены на внешнем GHCR/VPS;
- production authorization handoff и exact approval-bound deployment controller
  не подключены;
- client API в OCI image использует same-origin URLs; Stripe в текущем
  immutable baseline отключён, пока publishable key не вынесен в
  отдельный runtime public-config contract.

## Проверка агентского baseline перед выпуском

`ci.yml` запускает structural gate `ai:quality:structure` и тесты eval contracts
без обращений к модели. Reusable CI принимает `require_agent_baseline`;
`release.yml` и `prepare-release-candidate.yml` передают `true`. Поэтому отсутствие,
устаревание или обязательное нарушение в baseline останавливает delivery до
публикации образа. Точный источник кандидата остаётся обязательным.

`ai:eval:gate` читает owner pointer `.github/quality-evidence/current.json` и
проверяет immutable report/review, текущие hashes runtime/harness/instructions,
platform/architecture/Node, полный corpus и качественную оценку всех результатов.
Одинаковые входы допускают переиспользование evidence. Изменённые model/CLI/runtime
требуют нового bounded прогона по [§29.8](../specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/29-testing-strategy.md#298-контракт-первого-baseline-plat-05).
Garden/Router должны проверять exact model/catalog/policy candidate дополнительно
при активации; их lifecycle ещё не реализован.

Evidence из trusted owner checkout имеет локальное происхождение. SHA-256 защищает
целостность и привязку, но не доказывает независимого автора или реальный вызов
сам по себе. Недоверенный клиентский отчёт нельзя импортировать как допуск.
Центральная аттестация и разграничение клиентских репозиториев относятся к PLAT-10.

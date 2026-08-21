# CI, release и выкладка

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
- release не подписывается keyless-подписью;
- media и PostgreSQL остаются single-host volumes;
- нет central secrets manager, multi-host orchestration и production central
  AI worker service.
- client API в OCI image использует same-origin URLs; Stripe в текущем
  immutable baseline отключён, пока publishable key не вынесен в
  отдельный runtime public-config contract.

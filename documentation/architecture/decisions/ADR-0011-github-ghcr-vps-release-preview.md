# ADR-0011: GitHub/GHCR/VPS release preview adapter

## Status

accepted

## Context

ADR-0010 зафиксировал provider-neutral JSON boundary для подготовки OCI
release-кандидата, но оставил выбор remote preview orchestrator открытым.
Текущая delivery-платформа уже определена ADR-0009: GitHub Actions, GHCR и
один Linux VPS с Docker Compose.

Для release approval нужен реальный adapter, который получает exact service
commit из локального preview flow, строит immutable image, создаёт и проверяет
security evidence, разворачивает изолированный HTTPS preview и возвращает
строгий JSON result. Этот adapter не должен получать production authority.

## Decision

- server-owned adapter публикует exact commit в отдельный remote ref
  `refs/heads/ai/release-candidates/<candidate-key>` и запускает только
  `prepare-release-candidate.yml` через GitHub CLI;
- Git publication использует общий `@realize/git-runtime`. Новая candidate ref
  создаётся с атомарным условием отсутствия
  `--force-with-lease=<exact-ref>:` и только с exact approved commit. Уже
  существующий ref на другом commit блокирует публикацию, включая гонку между
  preflight и push; безусловный `--force` и перезапись ref запрещены;
- workflow определяется из trusted ref, а candidate source checkout выполняется
  по exact 40-character commit SHA;
- GHCR image строится и публикуется один раз, затем идентифицируется только как
  `ghcr.io/...@sha256:<digest>`;
- BuildKit создаёт OCI SBOM и provenance attestations; Trivy проверяет exact
  digest; Cosign выполняет keyless signing через GitHub OIDC и сразу проверяет
  signature identity, candidate key и Git commit;
- отдельный GitHub environment `release-preview` содержит только scoped VPS
  preview credentials и не имеет доступа к production environment secrets;
- preview запускается на выбранном VPS как отдельный Docker Compose project с
  отдельными PostgreSQL/media volumes, восстановлением заранее подготовленного
  sanitized dump, read-only media, internal backend network и выключенным AI
  runtime; только Nginx подключён также к public frontend network;
- HTTPS завершается отдельным Nginx container на уникальном hostname/port с
  pre-provisioned wildcard certificate и Basic Auth; readiness endpoint остаётся
  доступен для machine verification;
- preview expires по timestamp кандидата; hourly cleanup workflow удаляет
  просроченный Compose project и его volumes;
- GitHub Actions artifact является handoff обратно в JSON adapter. Adapter
  принимает artifact только от exact correlated workflow run и повторно
  проверяет candidate key, commit и source hashes;
- этот workflow не имеет production job. `RELEASE_APPROVAL` не запускает
  rollout, пока отдельный deployment controller не проверяет exact approval
  binding и R4 policy.

## Consequences

- центральному execution worker нужны GitHub CLI, Git и scoped token с
  `contents:write` и `actions:read/write` только для текущего repository;
- repository должен разрешать service identity создавать refs только в
  `ai/release-candidates/*`;
- VPS требует Docker Compose, `flock`, `ss`, `curl`, wildcard DNS/TLS, Basic
  Auth file, sanitized PostgreSQL dump, sanitized media snapshot и заранее
  настроенный scoped `packages:read` credential для GHCR;
- port pool и single-host capacity являются ограничением первого adapter-а;
- GitHub/VPS secrets и host bootstrap остаются operator-owned и не хранятся в
  git;
- production authorization handoff, blue/green rollout и rollback evidence
  остаются следующим отдельным scope.

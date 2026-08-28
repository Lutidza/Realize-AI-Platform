# ADR-0010: OCI release control-plane boundary

## Status

accepted

## Context

После принятия local preview системе нужен отдельный переход к OCI-кандидату и
release approval. Конкретный preview orchestrator из вариантов Docker hosts,
Nomad или Kubernetes ещё не выбран, поэтому Payload и Change Engine не должны
зависеть от API одного provider-а или получать production credentials.

## Decision

- OCI release хранится в отдельном `ReleaseCandidate` aggregate и не
  перегружает local-preview deployment;
- переход начинается только из `preview_accepted` и связан с exact preview
  artifact, evidence и service commit;
- release worker вызывает server-owned executable через JSON `stdin/stdout`,
  без shell, по абсолютному пути и только с явно allowlisted environment;
- результат считается готовым только при immutable `sha256:` image ref,
  manifest hash, SBOM digest, verified signature, migration-set hash и healthy
  HTTPS OCI preview;
- admin сохраняет отдельный `RELEASE_APPROVAL`, связанный со всеми
  security-relevant release полями, actor, version, environment и expiry;
- browser не задаёт image digest и не вызывает orchestrator напрямую;
- этот control-plane slice не предоставляет production deployment endpoint,
  credentials или authority.

## Consequences

- rebuild, изменение digest, manifest, signature, migrations или evidence
  требует нового кандидата и нового approval;
- unsigned или unhealthy candidate fail-closed и не может получить release
  approval;
- GitHub/GHCR/VPS adapter должен реализовать JSON-port отдельным delivery scope;
- выбор Docker hosts, Nomad или Kubernetes остаётся отдельным ADR до подключения
  реального remote OCI preview orchestrator;
- production deployment остаётся за GitHub Environment/deployment controller и
  должен дополнительно проверить exact digest-bound authorization до rollout.

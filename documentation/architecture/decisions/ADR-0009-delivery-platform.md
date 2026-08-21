# ADR-0009: Delivery platform

## Status

accepted

## Context

Для первого delivery slice требуются конкретные CI provider, registry и deployment target. Пользователь подтвердил начало реализации pipeline до остальных write-capabilities.

## Decision

- CI provider: GitHub Actions;
- OCI registry: GitHub Container Registry (GHCR);
- deployment target: Linux VPS с Docker Compose;
- environments: `staging` автоматически после публикации release image, `production` только через GitHub Environment approval;
- единица promotion: один и тот же immutable image digest;
- transport на VPS: SSH к scoped deployment account;
- database migration: отдельный one-shot compose command до web rollout;
- readiness: HTTP health endpoint после rollout;
- rollback: возврат к предыдущему сохранённому digest, без rebuild.

## Consequences

- repository secrets и environment protection настраиваются вне git;
- production job не принимает mutable `latest` как release identity;
- отсутствие VPS/GitHub secrets блокирует фактический deploy, но не локальную проверку manifests;
- Kubernetes/Nomad, central secret manager, signing и multi-host orchestration остаются следующими hardening steps.

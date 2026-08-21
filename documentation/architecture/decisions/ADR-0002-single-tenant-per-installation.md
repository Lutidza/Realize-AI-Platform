# ADR-0002: Single tenant per installation

## Status

accepted-as-target

## Context

Первая промышленная версия должна изолировать клиентов без преждевременного общего multi-tenant data plane.

## Decision

Один клиент получает отдельные application deployment, PostgreSQL database, secrets, media storage и installation identity. Payload multi-tenant plugin не используется как граница разделения клиентов в v1.

## Consequences

- site API никогда не принимает installation ID как доверенный input;
- installation context определяется server-side;
- backup, restore, migrations и rollout выполняются на уровне конкретной установки;
- fleet orchestration может быть общей, данные сайта — нет.

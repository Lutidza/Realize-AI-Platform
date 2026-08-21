# 27. Docker и инфраструктура

## 27.1. Client site stack

Минимальный deployment unit:

```yaml
services:
  web:
    image: registry/realize-client@sha256:...
    read_only: true
    depends_on:
      - postgres
  postgres:
    image: postgres:<pinned>
    volumes:
      - client-db:/var/lib/postgresql/data
  backup-agent:
    image: registry/realize-backup-agent@sha256:...
```

Media рекомендуется хранить в S3-compatible storage, а не внутри container filesystem.

## 27.2. Отдельный worker в клиентском compose

В рекомендованной v1 Codex worker не входит в клиентский stack.

Допустим lightweight site connector для:

- outbound control-plane connection;
- health;
- capability-token validation;
- deployment commands;
- tool gateway.

Connector не содержит OpenAI key.

## 27.3. Central services

- control-plane-api;
- license-service;
- billing-service;
- usage-service;
- orchestrator;
- worker-manager;
- codex-workers;
- buildkit/build workers;
- deployment-controller;
- operator-console;
- PostgreSQL control DB;
- queue;
- object/artifact storage;
- OCI registry;
- observability.

## 27.4. Queue choice

Для site-local low-volume jobs можно использовать Payload Jobs, сохраняемые в Postgres.

Для central orchestration нужен durable queue с:

- leases;
- retries;
- delayed jobs;
- dead-letter;
- concurrency limits;
- idempotency;
- visibility timeout.

Конкретная технология выбирается ADR после оценки текущей инфраструктуры. Domain contract не должен зависеть от конкретной queue library.

## 27.5. Backup

Перед production migration:

- verified backup;
- backup ID в deployment record;
- restore test policy;
- encryption;
- retention.

Начальные целевые показатели:

- DB backup минимум ежедневно;
- point-in-time recovery при доступности;
- pre-deploy snapshot для R3/R4;
- регулярная проверка восстановления.

---


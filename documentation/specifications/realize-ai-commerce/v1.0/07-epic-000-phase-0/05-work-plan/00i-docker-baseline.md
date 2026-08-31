# Этап 0I. Docker development/production baseline

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Добавь:

- multi-stage `Dockerfile`;
- `.dockerignore`;
- compose для app + PostgreSQL;
- named volumes;
- healthchecks;
- non-root runtime user;
- startup/migration strategy;
- seed profile для local development;
- production-like build target;
- documented environment contract;
- graceful shutdown;
- исключение secrets из image layers.

Не помещай в клиентский образ:

- OpenAI API key;
- будущие central service credentials;
- signing private keys;
- CI credentials;
- production database dump.

В рамках Phase 0 AI services не нужны.

Проверь:

```text
docker build
docker compose config
docker compose up
health endpoint
migration on empty DB
seed
storefront smoke
admin smoke
docker compose down
```

Если Docker daemon недоступен, зафиксируй `blocked`, но всё равно проведи статическую проверку Dockerfile/compose.

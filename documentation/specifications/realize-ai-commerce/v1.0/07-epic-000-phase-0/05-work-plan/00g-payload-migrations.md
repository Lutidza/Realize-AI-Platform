# Этап 0G. Payload migrations

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Добавь production-safe migration baseline:

- `src/migrations/**`;
- initial migration для актуальной схемы;
- migration index;
- documented create/status/run workflow;
- локальный dev policy;
- production policy: schema changes только через reviewed migrations;
- CI check для migration status/schema drift;
- тест применения migrations на пустой PostgreSQL;
- тест повторного запуска, где это применимо.

Не запускай destructive migration над неизвестной/реальной базой.

Проверь, какие параметры Postgres adapter нужны для отключения небезопасного schema push в production, и зафиксируй это явно.

# Этап 0G. Payload migrations

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


---
name: payload-next-contracts-first
description: >-
  Используй для Payload/Next backend работы в Realize — AI Platform: Payload config,
  collections, hooks, access, migrations, Next API routes, data resolvers,
  Search Profile, Elasticsearch indexing and UI data contracts.
---

# Payload/Next: сначала контракты

Skill применяется, когда основной риск - смешать transport, validation,
business logic, mapping, persistence and frontend data contract in the wrong
layer.

## Выбор источников

Используй уже выполненный вход по `AGENTS.md`; актуальные прочитанные источники
повторно не загружай. Если не хватает фактов, открой относящийся к контракту
раздел `documentation/project-context.md` и текущий код владельца.

По `.ai/roles/developer/backend/INDEX.md` и
`.ai/registry/rules/development/backend/INDEX.md` выбери правила и checks именно
для изменяемого контракта. Читай выбранные требования, а не весь backend-раздел
и граф его ссылок. Frontend роль подключай, если меняется frontend consumer.

Недостающий контекст при доступном Internal MCP получай по S1-маршруту
`.ai/workflows/ai-operations/mcp-tooling/WORKFLOW.md`. Это не требует повторного
bootstrap уже полученных актуальных источников. Metadata не заменяет чтение
текста; при недоступности MCP используй прямое чтение без смены policy.

## Порядок

1. Определи изменяемый contract: Payload collection/field, hook, access rule,
   migration, API route, resolver, response shape, search profile or indexer.
2. Определи source of truth: Payload/PostgreSQL, Search Profile,
   Elasticsearch projection, Redis cache or route helper.
3. Держи Payload schema changes в canonical collection/config owner.
4. Если меняется контракт БД, используй миграции Payload. Schema push допускается
   только для явно согласованной одноразовой локальной БД по профильному правилу.
5. Если меняется поисковый API, подтверди существующий механизм и проследи путь
   данных до потребителя; Search Profile и Elasticsearch проверяй при их наличии.
6. Response/data shape для React consumers держи в явном mapper/resolver owner,
   not ad hoc duplicated logic.
7. После owner decision обновляй consumers and generated types when needed.

## Проверки

- `npx tsc --noEmit --pretty false`.
- `npm run lint` when source changes require lint.
- `npm run payload -- migrate:status` for database scope.
- `npm run payload:generate-types` при изменении схемы Payload.
- Targeted Vitest or documented skip reason.
- Проверка состояния индекса или переиндексация — для существующего поискового
  механизма, если от них зависит результат изменения.

## Ограничения

- Не помещай business/data logic в route component.
- Не редактируй generated `src/payload-types.ts` вручную.
- Не меняй frontend consumer до фиксации backend contract owner.

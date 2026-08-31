# Этап 0A. Инвентаризация и доказательная карта репозитория

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Создай:

- `documentation/reports/EPIC-000-REPOSITORY-AUDIT.md`;
- `documentation/reports/EPIC-000-IMPORT-GRAPH-SUMMARY.md`;
- `documentation/adr/ADR-0001-active-product-contour.md`;
- при необходимости дополнительные ADR, перечисленные далее.

Аудит должен включать:

## A. Контуры приложения

Для каждого значимого контура укажи:

- путь;
- назначение по документации;
- фактические entrypoints;
- кто импортирует этот код;
- попадает ли он в Next build;
- попадает ли он в root TypeScript project;
- используется ли он в Payload config;
- используется ли он в storefront/admin/API;
- зрелость: active / experimental / legacy / generated / tool-only / unknown;
- конфликты с другим contour;
- рекомендуемый статус.

Отдельно проанализируй:

- `src/app/(app)/**` или фактический основной route group;
- `src/app/(payload)/**`;
- `src/app/_realize/**`;
- `src/RealizeCore/**`;
- ожидаемый, но отсутствующий или неполный `src/domain/**`;
- `src/ui/**` и фактические shared UI owners;
- `.ai/tools/agent-runtime/**`;
- `.ai/tools/agent-monitor/**`;
- `scripts/**`;
- generated files.

## B. Import graph

Не требуется строить идеальный полный граф всех файлов. Нужен доказательный summary:

- какие root entrypoints импортируют `RealizeCore`;
- какие routes импортируют experimental components;
- unresolved aliases/imports;
- циклические зависимости, если найдены;
- nested applications, ошибочно включённые в root tsconfig;
- импорты generated types;
- пути, существующие только в документации;
- paths, которые являются orphaned.

Каждое утверждение подкрепляй конкретными путями и, где полезно, строками/командами поиска.

## C. Toolchain

Зафиксируй:

- установленную/заявленную версию Node;
- npm version;
- package manager source of truth;
- lockfile;
- Payload/Next/React/TypeScript versions;
- root tsconfig include/exclude/references;
- nested package engines;
- test frameworks;
- build commands;
- migration commands;
- generated type/import map commands.

## D. Infrastructure baseline

Зафиксируй наличие/отсутствие:

- Dockerfile;
- compose;
- CI;
- migrations;
- health endpoints;
- seed;
- backup/restore docs;
- `.env.example` completeness;
- MCP endpoint;
- production runtime docs.

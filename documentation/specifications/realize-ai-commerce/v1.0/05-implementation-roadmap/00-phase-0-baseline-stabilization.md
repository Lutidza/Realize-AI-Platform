# Phase 0. Baseline Stabilization

**Цель:** получить одну каноническую, собираемую, тестируемую и контейнеризованную основу.

## 0.1. Зафиксировать active contour

- определить, является ли `src/RealizeCore/**` активным будущим ядром или legacy;
- определить судьбу `src/app/_realize/**`;
- запретить агенту смешивать `(app)` и `_realize`;
- создать ADR;
- обновить `documentation/project-context.md`;
- обновить `documentation/architecture/project-structure.md`;
- обновить все `.ai/.codex` references.

**Рекомендуемое стартовое решение:** считать текущий `(app)` e-commerce contour активным, а `RealizeCore/_realize` — quarantined experimental contour до отдельной активации. Не выполнять массовое удаление без анализа.

## 0.2. Восстановить canonical docs

Создать/восстановить:

- root README;
- documentation INDEX;
- specs 031/032/042;
- build/run/deploy docs;
- architecture decision log;
- plugin development spec.

## 0.3. Починить baseline build

- `npm ci`;
- lint;
- typecheck;
- build;
- исправить unresolved imports;
- исключить nested tools из root tsconfig либо корректно разделить project references;
- проверить Payload config init;
- проверить generated types/import map.

## 0.4. Унифицировать runtime

- Node 24 LTS exact patch;
- npm;
- `.nvmrc`/`.node-version`;
- package `engines`;
- Docker base image;
- CI version check;
- заменить `pnpm dev` в Playwright.

## 0.5. Добавить migrations

- `src/migrations/**`;
- initial migration;
- migration status;
- запрет schema push в production;
- migration CI.

## 0.6. Добавить реальные tests

Минимум:

- Payload config integration test;
- auth/access test;
- products/categories test;
- storefront smoke;
- admin smoke;
- checkout smoke без реального платежа.

## 0.7. Docker development baseline

- Dockerfile;
- compose app + Postgres;
- health checks;
- seed;
- volumes;
- non-root user;
- production-like build.

## 0.8. CI baseline

- install;
- lint;
- typecheck;
- tests;
- build;
- migration check;
- artifact reports.

## 0.9. MCP baseline

- установить официальный Payload MCP plugin либо удалить ложную config до реализации;
- создать минимальный read-only endpoint;
- проверить access;
- не включать writes.

## Phase 0 acceptance

- clean clone запускается одной documented command;
- build зелёный;
- tests зелёные;
- Docker image собирается;
- migration применяется к пустой базе;
- docs соответствуют paths;
- Codex получает корректную карту проекта;
- нет заявленного несуществующего MCP endpoint.

---


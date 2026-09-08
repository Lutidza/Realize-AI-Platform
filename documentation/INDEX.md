# Документация Realize

`documentation/` хранит продуктовый, архитектурный и эксплуатационный контекст
проекта. Активные инструкции агентов находятся в `.ai/**`, а исполняемые
Codex-адаптеры — в `.codex/**`.

## Статусы документов

- **Target specification** — нормативное целевое состояние продукта.
- **Current implementation** — подтверждённое состояние текущего репозитория.
- **Historical evidence** — датированные решения, отчёты и выполненные задания;
  они не являются активной командой на реализацию.

## Основные entrypoints

1. [Контекст проекта](project-context.md) — current implementation и границы.
2. [Структура проекта](architecture/project-structure.md) — фактические owners.
3. [Master spec Realize v1.0](REALIZE_AI_COMMERCE_MASTER_SPEC_v1.0_RU.md) — target specification.
4. [Delivery runbooks](delivery/INDEX.md) — эксплуатация текущего baseline.
5. [MCP tooling](architecture/mcp-tooling.md) — project-specific adapter state.
6. [Architecture Decision Log](architecture/decisions/INDEX.md).

## На согласовании

- [Стандарт именования и структуры кода](architecture/code-naming-and-structure.md)
  — ссылки на действующие правила именования и комментариев;
  структура модулей и разделение ответственности остаются на согласовании.

## Спецификация v1.0

Путь `specifications/realize-ai-commerce/` сохранён как legacy namespace
репозитория. Он не ограничивает продукт интернет-магазинами.

- [Оглавление версии 1.0](specifications/realize-ai-commerce/v1.0/INDEX.md)
- [Roadmap Phase 0–6](specifications/realize-ai-commerce/v1.0/05-implementation-roadmap/INDEX.md)
- [Execution governance](specifications/realize-ai-commerce/v1.0/06-execution-governance/INDEX.md)
- [EPIC-000 Phase 0 — historical snapshot](specifications/realize-ai-commerce/v1.0/07-epic-000-phase-0/INDEX.md)

## Исторические материалы

`documentation/reports/**` и ADR с датой или номером сохраняют evidence
выполненных решений. Отчёты не следует переписывать под текущее состояние;
актуальный статус фиксируется в `project-context.md`, delivery runbooks и новых
ADR.

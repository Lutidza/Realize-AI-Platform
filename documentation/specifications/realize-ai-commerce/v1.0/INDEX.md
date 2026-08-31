# Realize AI-Controlled CMS Platform v1.0

- **Статус:** target specification
- **Модель продукта:** универсальное CMS-ядро и подключаемые профили сайтов
- **Первый промышленный профиль:** e-commerce
- **Deployment V1:** single-tenant per installation
- **Фактический baseline:** [project context](../../../project-context.md)

Legacy-путь `realize-ai-commerce` сохранён для совместимости ссылок. Все
планируемые интерфейсы должны быть помечены как target и не выдаваться за
реализованные.

## Нормативный порядок

1. [Продукт, назначение и scope](00-product-and-scope/INDEX.md)
2. [Архитектурные контракты](01-architecture/INDEX.md)
3. [Change Engine и pipelines](02-change-engine-and-pipelines/INDEX.md)
4. [Runtime, delivery и безопасность](03-runtime-delivery-and-security/INDEX.md)
5. [Коммерческий и операционный контур](04-commercial-and-operations/INDEX.md)
6. [Roadmap Phase 0–6](05-implementation-roadmap/INDEX.md)
7. [Execution governance и Definition of Done](06-execution-governance/INDEX.md)

## Исторический контур

[EPIC-000 Phase 0](07-epic-000-phase-0/INDEX.md) — выполненное задание,
сохранённое как historical evidence. Оно не является текущим backlog и не
запрещает уже реализованные admin AI, execution, preview или delivery
capabilities.

## Правило истины

- Target contract: разделы `00–06` этой спецификации.
- Current implementation: код, manifests, migrations, tests,
  `documentation/project-context.md` и delivery runbooks.
- Historical evidence: `07-epic-000-phase-0/**`, reports и ранее принятые ADR.

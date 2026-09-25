# Документация Realize

`documentation/` хранит продуктовый, архитектурный и эксплуатационный контекст
проекта. Активные инструкции агентов находятся в `.ai/**`, а исполняемые
Codex-адаптеры — в `.codex/**`.

## Статусы документов

- **Draft specification** — проект задания для обсуждения; требования ещё не утверждены.
- **Target specification** — нормативное целевое состояние продукта.
- **Current implementation** — подтверждённое состояние текущего репозитория.
- **Historical evidence** — датированные решения, отчёты и выполненные задания;
  они не являются активной командой на реализацию.

## Основные entrypoints

[Продуктовый бриф для маркетинга и UI/UX](product-brief.md) — самостоятельное
описание концепции конечного продукта: единой ИИ-платформы для бизнеса, сайтов
и команды, её возможностей, преимуществ и пользовательских сценариев.
Вводные для маркетингового агента и агента по интерфейсам.

[Полный функциональный каталог](product-functional-catalog.md) — подробный состав
возможностей конечного продукта по всем направлениям, с идентификаторами функций,
картой навигации и сквозными сценариями для проектирования и декомпозиции задач.

1. [Контекст проекта](project-context.md) — current implementation и границы.
2. [Структура проекта](architecture/project-structure.md) — фактические owners.
3. [Master spec Realize v1.0](REALIZE_AI_COMMERCE_MASTER_SPEC_v1.0_RU.md) — target specification.
4. [Delivery runbooks](delivery/INDEX.md) — эксплуатация текущего baseline.
5. [MCP tooling](architecture/mcp-tooling.md) — внешние adapters, внутренний MCP и запуск Admin manager.
6. [Architecture Decision Log](architecture/decisions/INDEX.md).

Подключение аккаунта ChatGPT или API key и требования к исполнителям:
[интеграция Codex](architecture/codex-integration.md).

## Стандарты разработки

- [Стандарт именования и структуры кода](architecture/code-naming-and-structure.md)
  — действующие правила именования, ответственности, структуры, типов и комментариев.

## Спецификация v1.0

Путь `specifications/realize-ai-commerce/` сохранён как legacy namespace
репозитория. Он не ограничивает продукт интернет-магазинами.

- [Оглавление версии 1.0](specifications/realize-ai-commerce/v1.0/INDEX.md)
- [Roadmap Phase 0–6](specifications/realize-ai-commerce/v1.0/05-implementation-roadmap/INDEX.md)
- [Execution governance](specifications/realize-ai-commerce/v1.0/06-execution-governance/INDEX.md)
- [EPIC-000 Phase 0 — historical snapshot](specifications/realize-ai-commerce/v1.0/07-epic-000-phase-0/INDEX.md)

## Проекты развития

- [Мастерская дизайна](specifications/design-workshop.md)
  — проект общего инструмента референсов, компонентов и тем для Admin,
  ChatGPT и IDE; сравнение подходов, агентский процесс и этапы runtime.
- [Внутренний MCP Realize](specifications/internal-mcp.md)
  — контракт реализованных A+G+S1 и последующих S2–S5/B/P/C этапов MCP;
  [план реализации](specifications/internal-mcp-implementation-plan.md) и
  [аудит проекта и двух слоёв ИИ](reports/PROJECT-AI-MCP-AUDIT-2026-09-20.md).
- [Task manager для людей и ИИ-агентов](specifications/task-management.md)
  — ТЗ 0.9 и интерактивный референс: рабочие среды, проекты, папки, списки,
  полный редактор задач, участники, чеклисты, связи и модель исполнения.
- [Системный шаблон админки](architecture/system-admin-shell.md)
  — общая оболочка Realize, независимая от Payload CSS, host adapter и постепенный перенос.
- [Исполнение задач и интеграция с AI](specifications/task-management-execution.md)
  — техническая часть ТЗ: назначения, очереди, runtime adapters и восстановление.
- [Менеджер расширений Payload](specifications/extension-management.md)
  — черновик ТЗ каталога, установки, обновления и удаления через Admin.
- [Медиатека: обработка изображений, загрузка и MediaBlock](specifications/media-management.md)
  — рабочая библиотека, профили и фоновая обработка изображений;
  отдельно описаны целевые сценарии применения и расширения.
- [Референсы интерфейса медиатеки](specifications/media-management-references.md)
  — официальные примеры, применимые сценарии и требования к экранам.

## Исторические материалы

- [Передача контекста референсов и навигации — 19 сентября 2026](reports/REFERENCE-WORKBENCH-HANDOFF-2026-09-19.md)
  — устройство каркаса, завершённые UI-итерации, обсуждённая панель «Пользователи»
  и точка продолжения в другом диалоге.

`documentation/reports/**` и ADR с датой или номером сохраняют evidence
выполненных решений. Отчёты не следует переписывать под текущее состояние;
актуальный статус фиксируется в `project-context.md`, delivery runbooks и новых
ADR.

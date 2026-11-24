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
7. [Поиск для агентов и диагностика](architecture/repository-search.md) — CLI/MCP,
   измерения, история Admin и ограничения покрытия.
8. [Измерение производительности платформы](architecture/platform-performance-measurement.md) —
   правила baseline, локальных benchmark, operational telemetry и этапность Admin аналитики.
9. [Доступы платформы и авторизация CLI](architecture/platform-access.md) —
   личные/API токены, browser approval, scopes, сроки, отзыв и Secret Service.
   [Целевые инженерные полномочия ENG-05](architecture/platform-access.md#единые-инженерные-полномочия-eng-05) —
   identity/grants для IDE, Admin и GPT, персональный OAuth и границы native доступа.
10. [Протокол инженерных операций ENG-06](architecture/engineering-operations.md) —
    DTO, plan/preview/apply, блокировки, восстановление, генераторы и пределы проверок/очередей;
    §12 — основание ENG-07; §13 — создание файлов/папок ENG-08; §§14–15 —
    exact-version edit ENG-09 и bounded project/directory move ENG-10 с metadata,
    ссылками и case-only ограничениями. §16 — план первого среза ENG-11 на
    пользовательской проверке; клиентские tools ещё не активированы.

Подключение аккаунта ChatGPT или API key и требования к исполнителям:
[интеграция Codex](architecture/codex-integration.md).

## Стандарты разработки

[ТЗ программного создания и развития агентов](specifications/agent-authoring.md) —
согласованное ТЗ, реализация начата: аудит существующих инструментов, создание агентов и
skills, оценка, улучшение и сравнение результатов.

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

- [Общие инженерные операции для IDE, Admin и GPT](architecture/decisions/ADR-0019-shared-engineering-operations.md)
  — целевая архитектура файловых операций, штатных генераторов, Task Manager
  и архитектурного наблюдения; TASK-60 / ENG-02, реализация отдельными этапами.
- [Типы инженерных артефактов и назначение папок](architecture/engineering-artifacts.md)
  — целевой контракт descriptors, native metadata, наследования папок и
  authored/generated-секций; §8 — начальный binding `source.util`/`ai.template`
  TASK-66 / ENG-08; §9 — матрица фактической/целевой поддержки TASK-93.
  Полный каталог и генераторы остаются целевыми.
- [Краткий бриф для выбора стека интерфейсов и шаблонов](frontend-template-stack-review-brief.md)
  — цели, предварительное предложение и вопросы для независимой оценки.
- [Мастерская дизайна](specifications/design-workshop.md)
  — проект общего инструмента референсов, компонентов и тем для Admin,
  ChatGPT и IDE; сравнение подходов, агентский процесс и этапы runtime.
- [Внутренний MCP Realize](specifications/internal-mcp.md)
  — контракт реализованных A+G+S1 и последующих S2–S5/B/P/C этапов MCP;
  [план реализации](specifications/internal-mcp-implementation-plan.md).
- [Task manager для людей и ИИ-агентов](specifications/task-management.md)
  — продуктовый контракт и интерактивный референс: рабочие среды, проекты, папки, списки,
  полный редактор задач, участники, чеклисты, связи и модель исполнения.
- [Системный шаблон админки](architecture/system-admin-shell.md)
  — общая оболочка Realize, независимая от Payload CSS, host adapter и постепенный перенос.
- [Первый релиз RealizeAI Control Panel](specifications/realize-ai-control-panel-first-release.md)
  — целевой состав, identity/version, reuse, безопасный переход и критерии
  глобального назначения Admin и отдельного оформления сайта.
- [Исполнение задач и интеграция с AI](specifications/task-management-execution.md)
  — техническая часть ТЗ: назначения, очереди, runtime adapters и восстановление.
  [Целевой lifecycle ENG-04](specifications/task-management-execution.md#15-целевой-контракт-задач-eng-04)
  определяет переходы, права, связи, результаты и совместимость v1/v2.
- [Менеджер расширений Payload](specifications/extension-management.md)
  — черновик ТЗ каталога, установки, обновления и удаления через Admin.
- [Медиатека: обработка изображений, загрузка и MediaBlock](specifications/media-management.md)
  — рабочая библиотека, профили и фоновая обработка изображений;
  отдельно описаны целевые сценарии применения и расширения.
- [Референсы интерфейса медиатеки](specifications/media-management-references.md)
  — официальные примеры, применимые сценарии и требования к экранам.

## Исторические материалы

[Доставка layout reader в локальный web, 2026-11-21](reports/2026-11-21-layout-reader-deployment.md)
— actual BUILD_ID/health, read-only сохранность назначений и ledger, закрытый
writer и ограниченный rollback readiness check.

[Локальный rollback-кандидат layout reader, 2026-11-21](reports/2026-11-21-layout-reader-rollback-candidate.md)
— переносимый архив, compiled-reader matrix и изолированный runtime smoke; без
обновления работающей службы и включения writer.

[Проверка доставки layout reader и сборки отката, 2026-11-21](reports/2026-11-21-layout-reader-delivery-rollback-audit.md)
— установленный artifact, отказ нового binding и границы локальной проверки rollback.

[Два макета Control Panel: metadata, bindings и состояние, 2026-11-17](reports/2026-11-17-control-panel-layout-contract-first-slice.md)
— два draft определения `0.1.0`, exact pins, стабильный Frame и проверки в браузере.

[Разбор референса для RealizeAI Control Panel, 2026-10-19](reports/2026-10-19-realize-one-reference-breakdown.md)
— TASK-22 / ONE-03: композиция, общие элементы, состояния, desktop/mobile и
light/dark; границы повторного использования и отличия от рабочего host.

[Проверка переключения шаблонов в браузере, 2026-10-19](reports/2026-10-19-template-switching-browser-audit.md)
— TASK-21 / ONE-02: Payload ↔ Realize, mode/settings, открытые вкладки, роли,
формы и recovery; исходные значения восстановлены.

[Карта глобального применения шаблонов, 2026-10-19](reports/2026-10-19-template-coverage-audit.md)
— TASK-20 / ONE-01: источники оформления Admin и сайта, динамические экраны,
пробелы глобального назначения и владельцы; статический аудит без изменения продукта.

[Передача шаблонов Admin для рефакторинга, 2026-10-12](reports/2026-10-12-admin-template-refactoring-handoff.md)
— выполненные этапы, рабочая установка, границы проверок и замечания пользователя;
разработка остановлена, качество результата не принято.

`documentation/reports/**` и ADR с датой или номером сохраняют evidence
выполненных решений. Отчёты не следует переписывать под текущее состояние;
актуальный статус фиксируется в `project-context.md`, delivery runbooks и новых
ADR.

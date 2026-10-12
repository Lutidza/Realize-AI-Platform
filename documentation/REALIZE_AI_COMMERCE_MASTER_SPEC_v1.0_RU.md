# Realize — AI Platform

## Канонический entrypoint спецификации v1.0

- **Статус:** target specification
- **Версия:** 1.0
- **Базовый репозиторий:** `Lutidza/Realize-AI-Platform`
- **Целевой стек:** Payload CMS 3, Next.js App Router, PostgreSQL и управляемые AI-агенты
- **Deployment V1:** single-tenant, отдельное приложение и база данных для каждой инсталляции

Realize — универсальная платформа для контролируемого создания, управления и
развития сайтов. E-commerce является первым промышленным профилем, но не
границей ядра. Legacy-имя этого файла и каталога спецификации сохраняется для
стабильности ссылок.

## Обязательный порядок чтения

1. [Оглавление версии 1.0](specifications/realize-ai-commerce/v1.0/INDEX.md)
2. [Продукт и scope](specifications/realize-ai-commerce/v1.0/00-product-and-scope/INDEX.md)
3. [Архитектура](specifications/realize-ai-commerce/v1.0/01-architecture/INDEX.md)
4. [Change Engine и pipelines](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/INDEX.md)
5. [Runtime, delivery и security](specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/INDEX.md)
6. [Commercial и operations](specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/INDEX.md)
7. [Roadmap](specifications/realize-ai-commerce/v1.0/05-implementation-roadmap/INDEX.md)
8. [Execution governance](specifications/realize-ai-commerce/v1.0/06-execution-governance/INDEX.md)

Раздел [EPIC-000](specifications/realize-ai-commerce/v1.0/07-epic-000-phase-0/INDEX.md)
является историческим snapshot завершённого Phase 0 и исключён из активного
порядка исполнения.

## Граница исполнения

Спецификация определяет целевое состояние и не доказывает наличие функции в
runtime. Фактическое состояние проверяется по
[project context](project-context.md), коду, миграциям, тестам и
[delivery runbooks](delivery/INDEX.md). Любая реализация начинается с
`AGENTS.md`, active `.ai/**` gates и применимых `.codex/**` procedures.

# REALIZE AI COMMERCE PLATFORM

## Канонический entrypoint спецификации v1.0

- **Версия:** 1.0
- **Дата:** 15 августа 2026 года
- **Базовый репозиторий:** `Lutidza/Realize-E-Commerce`
- **Целевая платформа:** Payload CMS 3 + Next.js App Router + PostgreSQL + OpenAI Codex
- **Модель развёртывания первой версии:** single-tenant, отдельное приложение и отдельная база данных на каждого клиента

Полный нормативный текст спецификации декомпозирован по архитектурным
контрактам, этапам реализации и исполняемым шагам. Этот файл остаётся
стабильным каноническим entrypoint и не дублирует содержимое leaf-файлов.

## Обязательный порядок чтения

1. [Полное оглавление версии 1.0](specifications/realize-ai-commerce/v1.0/INDEX.md)
2. [Продукт, назначение и scope](specifications/realize-ai-commerce/v1.0/00-product-and-scope/INDEX.md)
3. [Архитектурные контракты](specifications/realize-ai-commerce/v1.0/01-architecture/INDEX.md)
4. [Change Engine и pipelines](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/INDEX.md)
5. [Runtime, delivery и безопасность](specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/INDEX.md)
6. [Коммерческий и операционный контур](specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/INDEX.md)
7. [Roadmap реализации Phase 0–6](specifications/realize-ai-commerce/v1.0/05-implementation-roadmap/INDEX.md)
8. [Правила исполнения и критерии готовности](specifications/realize-ai-commerce/v1.0/06-execution-governance/INDEX.md)
9. [EPIC-000: исполняемое задание Phase 0](specifications/realize-ai-commerce/v1.0/07-epic-000-phase-0/INDEX.md)

Сначала полностью читается Часть I — разделы `00`–`06`. Только после этого
можно выполнять Часть II — `07-epic-000-phase-0`. При смысловом конфликте
приоритет имеет Часть I; EPIC-000 конкретизирует только scope и порядок
исполнения Phase 0.

## Граница исполнения

Разбиение документа не означает автоматический запуск EPIC-000 или переход к
следующей фазе. Реализация выполняется только по отдельной задаче, после
применения активных правил `.ai/**`, соответствующих `.codex/**` adapters и
Pre-edit Gate.

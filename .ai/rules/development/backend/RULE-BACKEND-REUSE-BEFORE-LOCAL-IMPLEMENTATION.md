# Переиспользование перед локальной backend-реализацией

```yaml
rule_id: RULE-BACKEND-REUSE-BEFORE-LOCAL-IMPLEMENTATION
title: Переиспользование перед локальной backend-реализацией
owner_role: .ai/roles/developer/backend/INDEX.md
applies_to:
  - src/payload.config.ts
  - src/collections/**
  - packages/payload-ai-plugin/src/collections/**
  - src/app/(app)/api/**
  - packages/payload-ai-plugin/src/**
  - services/**
  - src/utilities/**
trigger:
  - создаётся или меняется collection, API route, resolver, service, mapper, hook, access rule, job, cache или search behavior
requirement:
  - найти существующий pattern через rg до новой реализации
  - выбрать существующий owner-layer, если он уже есть
  - создавать новый service/mapper/helper только после owner decision
forbidden:
  - копировать похожую data/service/API/search логику без поиска existing pattern
  - создавать второй локальный mapper, validator, access helper или cache policy
  - обходить существующий Payload field factory, hook, access rule или service owner
checks:
  - .ai/checks/development/backend/CHECK-BACKEND-REUSE-BEFORE-LOCAL-IMPLEMENTATION.md
related_tools:
  - rg
```

## Контракт

Перед локальной backend-правкой агент проверяет:

- existing Payload config, collections, field factories, hooks и access rules;
- существующие компоненты Payload Admin, если меняется конфигурация полей или
  административный интерфейс;
- data resolvers и mutations в `packages/payload-ai-plugin/src/**`;
- domain services в `services/**`;
- route/SRP helpers в `src/utilities/**`;
- API route patterns в `src/app/(app)/api/**`;
- search providers, indexing jobs и cache helpers.

Если existing owner найден, правка идёт туда или требуется explicit reason,
почему новый локальный owner корректен.

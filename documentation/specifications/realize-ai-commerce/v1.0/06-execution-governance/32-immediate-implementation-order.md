# 32. Immediate implementation order for AI agent

AI-агент не должен сразу создавать browser chat и deploy pipeline.

Первый implementation epic:

```text
EPIC-000: Stabilize Realize-E-Commerce as a canonical, buildable product base
```

## Шаг 1. Провести Pre-edit Gate

Зафиксировать:

- source of truth;
- active contour;
- owner-layer;
- allowlist;
- planned files;
- checks;
- blockers.

## Шаг 2. Не удалять `RealizeCore` автоматически

Сначала создать audit report:

- что импортируется активным app;
- что не используется;
- что конфликтует;
- что можно quarantine;
- что следует мигрировать.

## Шаг 3. Сделать baseline build green

Приоритет:

1. Node/package manager;
2. TypeScript boundaries;
3. imports;
4. Payload config;
5. tests;
6. build.

## Шаг 4. Синхронизировать `.ai/.codex`

После выбора contour:

- обновить docs;
- paths;
- registry;
- roles;
- checks;
- skills;
- MCP docs.

## Шаг 5. Добавить Docker + CI + migrations

Только после green local baseline.

## Шаг 6. Создать ADR-пакет

Минимум:

- ADR single-tenant;
- ADR active contour;
- ADR central AI execution;
- ADR plugin architecture;
- ADR delivery pipeline;
- ADR licensing.

## Шаг 7. Начать Phase 1

Только после formal acceptance Phase 0.

---


# Этап 0C. Каноническая документация

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Создай или восстанови:

- `README.md`;
- `documentation/INDEX.md`;
- `documentation/getting-started/local-development.md`;
- `documentation/getting-started/environment.md`;
- `documentation/architecture/runtime-boundaries.md`;
- `documentation/architecture/plugin-strategy.md`;
- `documentation/architecture/ai-platform-target.md` — краткая ссылка/конспект целевой платформы без дублирования полного ТЗ;
- `documentation/delivery/build-and-test.md`;
- `documentation/delivery/migrations.md`;
- `documentation/delivery/docker.md`;
- `documentation/adr/INDEX.md`;
- отсутствующие канонические specs, на которые реально ссылается active AI-layer, либо исправь ссылки на действующие документы.

Обнови:

- `documentation/project-context.md`;
- `documentation/architecture/project-structure.md`;
- `.ai` registry/roles/workflows/checks только там, где выявлен подтверждённый drift;
- `.codex` adapter artifacts только как отражение active `.ai` source of truth.

Требования к README:

- назначение продукта;
- текущий зрелый scope без обещания ещё не реализованного AI pipeline;
- стек;
- prerequisites;
- local setup;
- environment;
- database;
- seed;
- lint/typecheck/test/build;
- Payload commands;
- структура каталогов;
- статус experimental contour;
- ссылки на documentation index и ADR;
- security/secrets note.

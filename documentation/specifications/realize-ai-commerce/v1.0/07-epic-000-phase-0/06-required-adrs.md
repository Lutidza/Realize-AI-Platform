# 6. Обязательные ADR Phase 0

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Минимум создай:

1. `ADR-0001-active-product-contour.md`;
2. `ADR-0002-single-tenant-per-installation.md`;
3. `ADR-0003-central-ai-execution.md`;
4. `ADR-0004-payload-ai-plugin-boundary.md`;
5. `ADR-0005-runtime-and-package-manager.md`;
6. `ADR-0006-migrations-policy.md`;
7. `ADR-0007-mcp-phase-0-policy.md`;
8. `ADR-0008-commercial-licensing-direction.md`.

Для ADR 0002–0004 допускается статус `accepted-as-target`, даже если функция ещё не реализуется.

Ключевые решения, которые должны быть зафиксированы:

- один клиент = одно приложение + одна PostgreSQL + отдельные secrets/storage/installation identity;
- Payload multi-tenant plugin не используется в первой версии для разделения клиентов;
- постоянный OpenAI key не размещается в клиентском контейнере;
- Codex в будущей версии выполняется централизованно в изолированном worker;
- браузерный чат является UI, а не прямым каналом к shell/DB;
- AI-функционал оформляется как подключаемый Payload plugin;
- изменение production в будущем проходит только через Change Engine и immutable delivery pipeline.

---

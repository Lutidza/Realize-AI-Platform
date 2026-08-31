# Этап 0E. TypeScript и workspace boundaries

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Цель — root checks не должны случайно компилировать самостоятельные nested applications с несовместимыми aliases/config.

Проверь и при необходимости реализуй:

- точный `include` для product source;
- исключение `node_modules`, `.next`, reports, runtime state;
- отдельные tsconfig для `.ai/tools/agent-monitor` и других приложений;
- project references только если они реально упрощают boundary;
- отсутствие ручных изменений generated `src/payload-types.ts` и import map;
- отдельный script для каждого nested tool, если его проверка входит в CI;
- path aliases соответствуют фактическим owners.

Каждое исключение должно быть объяснено. Нельзя просто исключить проблемный product code, чтобы получить зелёный typecheck.

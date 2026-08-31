# 8. Acceptance criteria Phase 0

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Phase 0 считается завершённой только при выполнении всех применимых критериев.

## 8.1. Canonical architecture

- выбран и документирован один active product contour;
- experimental/legacy contour не смешивается с active;
- документация соответствует реальным путям;
- `.ai` является active source of truth;
- `.codex` не содержит независимых правил;
- отсутствующие каталоги не описываются как уже реализованные owners.

## 8.2. Reproducibility

- clean clone поднимается одной документированной последовательностью;
- exact/supported Node и package manager определены;
- clean install использует lockfile;
- environment contract документирован;
- seed воспроизводим.

## 8.3. Quality gates

- lint — `passed`;
- typecheck — `passed`;
- integration tests — `passed`;
- production build — `passed`;
- Playwright smoke — `passed`;
- либо каждый невозможный пункт честно помечен `blocked` с внешним доказанным blocker; в таком случае Phase 0 не считается полностью принятой.

## 8.4. Database

- migrations существуют;
- initial migration применяется на пустой PostgreSQL;
- production migration policy документирована;
- schema push не используется как production delivery mechanism;
- тестовые данные изолированы.

## 8.5. Docker

- image собирается;
- контейнер работает не от root;
- app + Postgres стартуют compose-командой;
- healthcheck проходит;
- secrets не встроены в image;
- storefront/admin smoke проходят внутри Docker contour.

## 8.6. CI

- workflow запускает весь baseline;
- PostgreSQL service доступен тестам;
- migration/build/test failures блокируют merge;
- reports доступны, но не раскрывают secrets;
- deployment отсутствует.

## 8.7. MCP

- либо endpoint реально существует и read-only smoke пройден;
- либо ложная конфигурация отключена и Phase 1 явно указан как owner;
- никакие write capabilities не доступны.

---

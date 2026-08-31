# 4. Анализ текущего репозитория

- **Статус:** current implementation
- **Дата среза:** 28 августа 2026 года
- **Источник истины:** code, manifests, migrations, tests и delivery workflows

## 4.1. Подтверждённый baseline

Репозиторий уже является рабочим e-commerce-профилем на Next.js 16.3, React
19.2, Payload CMS 3.88 и PostgreSQL. Runtime закреплён на Node.js 24.18.x и npm
11.15.x. Есть Docker/Compose, GitHub Actions, GHCR delivery, Vitest, Playwright,
health endpoints и versioned Payload migrations.

AI-контур декомпозирован по owners:

- `packages/ai-contracts/**` — DTO и события;
- `packages/change-engine/**` — планы, bindings, policies и checks;
- `packages/codex-adapter/**` — server-side Codex integration;
- `packages/payload-ai-plugin/**` — Payload collections, endpoints и Admin UI;
- `services/ai-control-plane/**` — loopback development control plane;
- `services/ai-execution-worker/**` — durable execution, preview и promotion.

## 4.2. Реализованные AI-возможности

В Payload Admin доступны drawer и `/admin/ai`. Реализованы read-only chat,
approval-gated Change Requests, durable run/events audit и SSE.

Первый Data Lane — `catalog.assignCategory.v1`. Он выполняет server-resolved
dry-run, hash-bound approval, transactional Payload write, optimistic lock,
audit/outbox и отдельный compensating rollback. Это подтверждает архитектуру,
но остаётся одной профильной операцией, а не универсальным data capability
registry.

Code Lane умеет создавать durable execution job, запускать Codex в отдельном
Git worktree, ограничивать paths, выполнять server-owned checks и сохранять
bounded diff/evidence. Принятый результат можно promote в изолированный commit,
поднять loopback preview на sanitized clone, принять hash-bound решением,
опубликовать в draft Pull Request и подготовить OCI Release Candidate.

`/admin/integrations` содержит provider-neutral registry и GitHub adapter с
write-only encrypted credential.

## 4.3. Реализованный delivery foundation

В репозитории находятся десять зарегистрированных миграций, CI/release/deploy
workflows, exact-digest deployment, application rollback, release-candidate
workflow, signed image evidence и TTL-bound release preview foundation.
Внешний GitHub/GHCR/VPS lane требует operator configuration и не считается
подтверждённым production rollout только по наличию файлов.

## 4.4. Основные разрывы до target V1

Пока отсутствуют или не завершены:

- универсальные capability adapters для data/schema/design/module/plugin;
- управляемый через Admin installation AI-layer;
- полный policy projection для read-denied и write-denied ресурсов;
- production authorization handoff и approval-bound deploy controller;
- полный database/data rollback для каждого класса изменений;
- license/subscription/usage enforcement;
- профильная система сайтов за пределами текущего e-commerce baseline;
- промышленное внешнее evidence на pilot installations.

В проекте нет действующего Payload MCP endpoint `/api/mcp`. Запись такого
server-а в Codex adapter была stale-конфигурацией и не является runtime
capability.

## 4.5. Вывод

Следующий этап — не повтор Phase 0 и не косметическое расширение чата. Нужно
обобщить доказанные lanes в универсальный Change Engine, добавить отдельный
installation AI-layer и завершить production authority, не выдавая модели raw
CRUD, SQL, shell, secrets или системный AI-layer.

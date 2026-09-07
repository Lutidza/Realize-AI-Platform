# EPIC-000 Pre-edit Gate

> **Исторический документ завершённого этапа EPIC-000.** Согласование от
> 17 августа 2026 года относится только к описанной ниже задаче и не разрешает
> новые работы. Исходные формулировки сохранены.
>
> Результат и ограничения — [итоговый отчёт](EPIC-000-IMPLEMENTATION-REPORT.md).

Дата: 2026-08-17  
Репозиторий: `Realize-E-Commerce`  
Статус: `PASS — реализация разрешена в указанном allowlist`

## 1. Задача и источник истины

Текущая задача объединяет два явно подтверждённых пользователем результата:

1. delivery baseline: воспроизводимая сборка, Docker Compose, CI, публикация OCI-образа, staging и ручное подтверждение production;
2. первый read-only slice AI Control Plane: чат с агентом в Payload Admin без write-tools, прямого shell-доступа из браузера и production credentials на клиенте.

Source of truth:

- `documentation/specifications/realize-ai-commerce/v1.0/**`;
- `documentation/project-context.md`;
- `documentation/architecture/project-structure.md`;
- текущая реализация `src/app/(app)/**`, `src/payload.config.ts` и `src/plugins/index.ts`;
- `AGENTS.md`, `.ai/**` и `.codex/**` как рабочий AI-layer.

Команда пользователя «приступай» рассматривается как явное расширение scope относительно запрета EPIC-000 на `/admin/ai` и production delivery: delivery baseline и read-only chat выполняются как отдельный согласованный slice, без выдачи чату полномочий executor-а.

## 2. Контур и owner-layer

- Contour-owner приложения: активный Next.js App Router-контур `src/app/(app)/**` и Payload entrypoint `src/payload.config.ts`.
- Owner регистрации расширений Payload: `src/plugins/index.ts`.
- Owner AI-функциональности: workspace packages `packages/ai-contracts/**`,
  `packages/change-engine/**`, `packages/codex-adapter/**` и
  `packages/payload-ai-plugin/**`.
- Owner внешнего Codex runtime: отдельный server-side control-plane service; браузер взаимодействует только с authenticated Payload API/SSE.
- Owner delivery: корневые Docker-файлы, `.github/workflows/**` и scoped deployment scripts.
- Owner архитектурных решений и runbook: `documentation/architecture/**`, `documentation/delivery/**`, `documentation/reports/**`.

`src/RealizeCore/**`, `src/app/_realize/**` и reference-контур не активируются и не удаляются. Создание нового contract-owner допускается только после ADR, фиксирующего активный продуктовый контур.

## 3. Professional solution check

- Shortcut considered: встроить вызов модели непосредственно в Client Component или выполнить deploy-команды из `/admin/ai`.
- Professional path: browser → authenticated Payload endpoint → server-side AI control plane → Codex app-server; delivery выполняется только доверенным CI runner/deployment host.
- Почему shortcut отклонён: он раскрывает credentials, смешивает UI и executor boundary, не даёт надёжных RBAC/audit/streaming contracts.
- Почему решение не является overengineering: первый slice остаётся read-only; write-tools, approvals, tool gateway, queues и autonomous execution не добавляются.
- Execution evidence: repository-wide поиск выполнен отдельной read-only search session; подтверждены реальные Payload/Admin owners и отсутствие готовых Docker/CI/SSE/health/test owners.
- Stub risk: UI не считается готовым без реального server-side runtime path; если Codex runtime недоступен, API должен возвращать явный диагностический статус, а не успешную заглушку.
- Contract-first decision: DTO/API/SSE контракты создаются до handler/UI и не отдают raw Payload documents.
- Scope expansion: ограничено delivery baseline и read-only conversation flow; любые write capabilities требуют нового gate.
- File responsibility: transport, contracts, runtime, access, rendering и deployment разделяются; крупные смешанные файлы не допускаются.
- Alias risk: source imports используют `@/`; новые alias не вводятся.
- Blocker: реальное staging/production развёртывание невозможно без GitHub environments, registry permissions, VPS host/user/key и настроенного server-side Codex authentication.

## 4. Allowlist

Разрешено создавать:

- `.nvmrc`, `.node-version`, `.dockerignore`, `Dockerfile`, `compose.yaml`;
- `.github/workflows/**`;
- `scripts/runtime/**`, `scripts/deploy/**`, `scripts/release/**`,
  `scripts/security/**`;
- `src/app/(app)/api/health/**`;
- `packages/ai-contracts/**`, `packages/change-engine/**`,
  `packages/codex-adapter/**`, `packages/payload-ai-plugin/**`;
- `services/ai-control-plane/**`, если runtime нельзя безопасно держать внутри web process;
- `tests/int/**`, `tests/e2e/**` в пределах реализуемого slice;
- `documentation/architecture/decisions/**`;
- `documentation/delivery/**`;
- `documentation/reports/**`.

Разрешено изменять:

- `package.json` и `package-lock.json` только при фактической необходимости и с сохранением текущих пользовательских изменений;
- `.env.example`, `.gitignore`, `.prettierignore`, `eslint.config.mjs`,
  `next.config.ts`, `playwright.config.ts`, `tsconfig.json`,
  `src/payload.config.ts`, `src/plugins/index.ts`;
- `documentation/INDEX.md`, `documentation/project-context.md`,
  `documentation/architecture/project-structure.md`;
- связанные `.ai/**` и `.codex/**` artifacts только при изменении их контрактов или путей.

Удаления: нет.

Generated artifacts (`src/payload-types.ts` и Payload import map) не
редактируются вручную. Migration scaffolds создаются официальным генератором,
после чего SQL обязательно review-ится и при необходимости делается
data-safe до проверки на fresh и upgrade databases.

## 5. Planned checks

- проверка dirty worktree до и после изменений;
- runtime/version evidence и проверка lockfile;
- targeted contract/access/runtime tests;
- `npm run lint`;
- TypeScript check без emit;
- `npm run build`;
- `docker compose config` и Docker image build, если Docker daemon доступен;
- health/readiness checks;
- browser evidence для `/admin/ai`, если локальный runtime и authentication доступны;
- проверка CI workflow syntax и отсутствие secrets/runtime state в diff;
- documentation/AI-layer drift check по фактическому scope.

## 6. Требует внешнего подтверждения или инфраструктуры

- GitHub repository environments `staging` и `production`;
- GHCR write permissions и retention policy;
- адрес, пользователь, SSH key и target directory VPS;
- production domain/TLS/reverse proxy;
- server-side Codex authentication и выбранная модель/лимиты;
- окончательное разрешение production environment reviewer-ом.

Эти данные не будут выдуманы или записаны в репозиторий.

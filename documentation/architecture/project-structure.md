# Структура проекта (источник для AI-layer)

- **Статус:** current implementation
- **Дата сверки:** 11 октября 2026 года (добавлен Task Manager Foundation)

## Активный продуктовый контур

- `src/app/(app)/**` — public site текущего e-commerce-профиля и application
  API routes.
- `src/app/(payload)/**` — generated Payload Admin/API bridge; generated
  page/layout вручную не редактируются.
- `src/app/(system-admin)/**` — authenticated System Admin shell, Мастерская
  и постоянный Task Manager `/system/task-manager`; reference остаётся отдельным маршрутом.
- `src/payload.config.ts` — root Payload config и migration owner.
- `src/plugins/index.ts` — единая точка регистрации Payload plugins.
- `src/collections/**`, `src/globals/**`, `src/blocks/**` — активная Payload
  schema и content owners.
- `src/components/**`, `src/providers/**`, `src/utilities/**` — фактические
  shared UI и application helpers текущего storefront.
- `src/migrations/**` — versioned Payload migrations; production schema push
  запрещён.
- `packages/payload-task-manager/**` — Task Manager Foundation: contracts,
  hidden collections, membership ACL, transactional mutations/replay/history,
  endpoints и узкий server facade. Host policy — `src/plugins/taskManager.config.ts`;
  operational UI — `src/components/admin/task-manager/**` вне `reference/`.

ADR-0001 фиксирует этот contour как active. `src/RealizeCore/**` и
`src/app/_realize/**` остаются quarantined experimental/legacy contour и не
подмешиваются в active implementation без отдельного решения. Сегмент
`src/app/(reference)/**` является reference surface, а не owner production
storefront.

## Realize AI chat, Data Lane, execution, preview, source promotion и release gate

- `packages/ai-contracts/**` — DTO, API envelope, SSE events, adapter contracts,
  `CapabilityDescriptor`, installation config artifacts, declarative workflows,
  strict start/continue DTO, private checkpoint и public workflow summary.
- `packages/change-engine/**` — plan derivation,
  plan/implementation/preview/release bindings, protected paths, check
  registries, short-lived execution capability, exact-version capability
  registry, canonical config hashes, draft/release validation и effective config
  compiler. `workflowExecution*.ts` владеют pure переходами и проверкой checkpoint;
  `workflowValueResolution.service.ts` — own-key/JSON Pointer lookup,
  `buildWorkflowStepInstructions.service.ts` — bounded step instructions
  и отдельным публичным вопросом без private данных.
- `packages/codex-adapter/**` — server-side Codex App Server adapter для
  read-only chat, изолированного `workspace-write` turn и отдельного ephemeral
  read-only reviewer; управление отдельным профилем и протоколом входа Codex.
- `packages/payload-ai-plugin/**` — Payload plugin, hidden runtime/config collections,
  authenticated endpoints, SSE bridge, общий Admin provider и три размещения
  чата, включая отдельные `DataOperation`, `SourcePromotion` и
  `ReleaseCandidate` aggregates, provider-neutral integration registry и
  installation Config API с redacted/audited DTO boundaries.
- `packages/ai-contracts/src/evaluation/` — versioned evaluation DTO; `packages/change-engine/src/evaluation/` — corpus, обязательные критерии и сравнение кандидатов.
- `.ai/tools/quality/` — structural CI gate инструкций; `scripts/runtime/evaluation/` — trusted owner CLI для настоящих Codex turns с общим ledger. `.github/quality-evidence/` связывает reviewed baseline с release/candidate gate.
- `packages/ai-contracts/src/usage/` — строгие contracts ledger и отдельные DTO
  владельца и клиентской установки; `packages/change-engine/src/usage/` — точный
  расчёт nanos и проверка неизменяемых тарифных снимков.
- `packages/payload-ai-plugin/src/usage/` — PostgreSQL ledger, budgets/reservations,
  metering ports, авторизация, аналитика и сверка. Control plane и execution worker
  используют `@realize/payload-ai-control/server/usage`.
- `packages/payload-ai-plugin/src/admin/usage/` — представления расходов клиента
  и владельца. `src/access/platformOwner.policy.ts` связывает owner-доступ с
  серверным allowlist и защищает аккаунт владельца от других admin. Точный охват —
  [контракт расходов](../specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/25-subscriptions-and-ai-billing.md#257-реализованный-локальный-контур-plat-04).
- `packages/payload-ai-plugin/src/chat-context/*Workflow*.ts` и
  `*workflow*.ts` — создание и продолжение workflow сегментов в существующих
  AIRun, private checkpoints, event projection и отмена.
  `endpoints/executeWorkflowCapability.service.ts` и
  `executeWorkflowCheck.service.ts` соединяют процесс с настоящим DataOperation
  dry-run и проверкой его текущего состояния; apply и approvals остаются
  у существующего Data Lane.
- `packages/payload-ai-plugin/src/endpoints/WorkflowRunRegistry.repository.ts`,
  `workflowRunRegistry.sql.ts`, list/detail services и mapper — owned реестр,
  серверная пагинация и safe история workflow из существующих AIRun.
- `packages/payload-ai-plugin/src/admin/workflow-runs/` — отдельные Admin views
  реестра и карточки, URL-фильтры, история шагов и действия. Команды продолжения,
  операций данных и SSE переиспользуют общие hooks Admin. URL helpers в
  `admin/realizeAILinks.util.ts` связывают карточку с историческим выпуском и чатом.
- `packages/payload-ai-plugin/src/integrations/runtime/` — серверное разрешение
  подключения GitHub: SQL в `IntegrationRuntime.repository.ts`, проверка записи
  в `validateRuntimeGitHubIntegration.validator.ts`, получение credential через
  vault в `GitHubConnection.service.ts`; типы и ошибка вынесены отдельно.
  `integrationRuntime.index.ts` задаёт экспорт
  `@realize/payload-ai-control/server/integration-runtime`.
  Source promotion и release используют этот модуль через узкий контракт
  `GitHubConnectionResolver`.
- `packages/payload-ai-plugin/src/integrations/codex/` — сохранение, проверка
  и вход Codex; вложенный `runtime/` предоставляет блокировку и авторизацию
  исполнителям. Контракт описан в [интеграции Codex](codex-integration.md).
- `services/ai-control-plane/**` — loopback development control plane, bounded
  Context Pack, безопасный каталог файлов проекта и приватные вложения чата.
  Metadata и проверка владельца вложений принадлежат Payload plugin; бинарные
  данные передаются через защищённый серверный канал, отдельно от JSON turn.
- `services/ai-execution-worker/**` — отдельный PostgreSQL queue consumer,
  Git worktree orchestration, scope/diff gates, allowlisted checks, exact-diff
  promotion, reviewer, sanitized DB clone, loopback standalone preview,
  exact-commit GitHub branch/draft PR publication и provider-neutral OCI
  release JSON-port.
- `scripts/release/github-*.mjs` и
  `.github/workflows/prepare-release-candidate.yml` — GitHub/GHCR adapter,
  exact candidate ref, signed immutable image и evidence handoff.
- `compose.release-preview.yaml`, `scripts/deploy/remote-release-preview.sh` и
  cleanup workflow — TTL-bound sanitized HTTPS preview на scoped VPS Compose.
- `/admin/ai` — custom Payload root view только для admin role; тот же chat
  controller доступен в правой панели на остальных страницах `/admin/**`.
  `/admin/ai/window` предоставляет отдельное окно. Представление принадлежит
  `packages/payload-ai-plugin/src/admin/chat/`, размещение и переходы —
  соседнему `chat-presentation/`, включая перенос `workflowDraft` с сырым
  JSON-текстом и exact profile selection, защищённый от потери
  неподтверждённого workflow запроса;
  `connection.enabled` интеграции GPT — Codex включает новые запуски;
  `configuration.agent` хранит модели, разрешения этапов и сроки. Вкладка
  «Агент» управляет ими без перезапуска, выключение сохраняет историю и recovery.
  Каждый HTTP-запрос получает проекцию `resolveCodexRuntimeOptions`, а worker
  читает текущие разрешения через `readWorkerRuntimeSettings`.
- `/admin/integrations` — пункт «Интеграции» в группе навигации «Настройки»;
  каталог карточек сервисов с поиском и фильтром
  активности; `/admin/integrations/:provider` — отдельные настройки сервиса.
  UI принадлежит `packages/payload-ai-plugin/src/admin/integrations/`,
  карточки и фильтры — вложенному `catalog/`. Реализованы GitHub и Codex;
  credentials остаются write-only и доступны только серверным исполнителям.

Browser не вызывает Codex напрямую. Chat-поток: Payload Admin → authenticated
Payload endpoint → server-only control-plane client → Codex adapter.

Внутренний MCP A+G+S1 имеет отдельный composition root `services/internal-mcp/src`.
Общие schemas/DTO — `packages/ai-contracts/src/Mcp*`, `mcp*.config.ts` и
`aiInstruction*.config.ts`/`AiInstructions.types.ts`;
registry, clients, Pages facade и receipts —
`packages/payload-ai-plugin/src/integrations/mcp/`, Admin — соседний
`admin/mcp-servers/`. Repository read policy принадлежит
`services/ai-control-plane/src`, там же размещён S1 resolver/read инструкций;
machine Git status/diff — `.ai/tools/git-delivery/src/read/`.
Каталог capabilities принадлежит MCP adapter; локальный credential helper —
`scripts/runtime/readLocalMcpHeaders.*.mjs`. Lifecycle и запуск описаны в
[MCP tooling](mcp-tooling.md); эти ports не предоставляют worker-у новые права.
Предустановки описаны в `mcpServerPresets.config.ts` у ai-contracts, установка и
login hook — у существующего plugin MCP owner. Они используют прежний registry,
не создавая отдельную БД конфигурации. Форма ChatGPT принадлежит Admin MCP
detail; клиентские ключи находятся в зашифрованном integration vault, а
доверенный host profile и master key — в операторском окружении.
`McpChatGpt.service.ts` владеет atomic save/disconnect,
`McpChatGptCredentials.service.ts` использует общий vault,
`McpChatGptRuntime.service.ts` проверяет boot/revision/ACL, а
`services/internal-mcp/src/McpChatGptSupervisor.service.ts` ведёт fixed child
и private health socket. Секреты не входят в browser DTO.

Data-поток: versioned assistant intent → Payload-owned selector resolution и
dry-run → hash-bound approval → transactional Local API write с access/hooks и
optimistic lock → audit/outbox → отдельное rollback approval → exact
before-snapshot restore.
Code-поток: exact plan approval → durable execution job → отдельный worker →
изолированный worktree → diff/check evidence → отдельное implementation
acceptance → exact replay → repeated checks → independent review → isolated
commit → local preview → preview acceptance → независимые draft PR и OCI
candidate lanes → release approval.
MCP, основной checkout и production deployment authority worker-у не выдаются;
source promotion не получает merge authority, а release executable получает
только явно allowlisted environment. Source/candidate refs и `release-preview`
environment не дают production deployment authority.

Typed foundation installation AI configuration находится в
`packages/ai-contracts/**` и `packages/change-engine/**`. Его Payload owner уже
добавляет hidden draft/release/pointer/event collections и strict
`/api/realize-ai/config/*`; schema зафиксирована migration
`20260901_163832_ai_config_persistence`. Раздел «Настройки → Агентский слой»
(`/admin/ai/settings`) находится в
`packages/payload-ai-plugin/src/admin/agent-layer-settings/**`. Этот owner содержит
оболочку с группами разделов, общий каталог всех восьми видов с поиском,
фильтрами и страницами, типизированные карточки и вычисление прямых/обратных
связей. Контекст каталогов сохраняется при переходах внутри рабочей области.
Выбор и копирование черновика, редакторы правил, профилей, ролей, навыков,
шаблонов, возможностей, проверок и процессов, серверная валидация, просмотр версий
и системной основы используют существующий Config API. Формы восьми видов,
общий выбор связей и действие создания в каталоге принадлежат тому же owner.
Создание, локальные копии и сохранение используют общий жизненный цикл формы,
защиту несохранённого ввода и aggregate
mutation с revision/CAS. Идентичность копии подбирается в пределах вида записи.
Отдельные API, DTO или persistence для редактора не создаются.
`AgentLayerBinding.types.ts` и helpers в этом owner задают обе формы,
структурную проверку, локальное копирование и aggregate mapper. Строковый
`maxTargets` преобразуется после проверки; наследуемые области сохраняются
отдельно от пустых массивов. `AgentLayerChoiceList` и его hook обслуживают
выбор записей черновика, системных целей и допустимых ограничений:
поиск, фильтр выбранных, страницы по 25 и сохранённые отсутствующие значения.
`AgentLayerWorkflow.types.ts` задаёт локальную модель графа, шагов и значений;
helpers формируют canonical `WorkflowDefinition` через существующий parser.
Операции переименования шага обновляют связанные ключи атомарно.
Hook редактора процесса владеет выбором и фильтрами каталога шагов;
данные и незавершённый ввод принадлежат общей форме и её lifecycle.
Исполняемый workflow engine в Admin owner не добавляется.
Проекция системной основы содержит зарегистрированные возможности и проверки;
она не предоставляет содержимое или редактирование `.ai/**` и `.codex/**`.

Этот же Admin owner содержит создание выпуска, просмотр immutable состава
с поиском и связями и отдельное переключение active pointer. Config endpoints
в `packages/payload-ai-plugin/src/endpoints/**` владеют release/activate/rollback,
транзакционной блокировкой, CAS и durable replay. Migration
`20260910_122259_ai_config_activation` расширяет audit event enum.

Контракты выбора, закрытого snapshot и публичной сводки chat run принадлежат
`packages/ai-contracts/**`; compiler, проверка hashes и ограниченный renderer
инструкций — `packages/change-engine/**`. В
`packages/payload-ai-plugin/src/chat-context/**` находятся разрешение active
release/profile, каталог для chat users, сохранение snapshot, runtime fingerprint
и ограниченная история для нового thread. UI выбора профиля и его состояние
находятся в `packages/payload-ai-plugin/src/admin/chat/**`; handoff использует
общий controller чата. `services/ai-control-plane/**` проверяет закрытый snapshot
и собирает provider prompt под существующей read-only policy.
Новые run columns не создаются: используется существующее `turnContext`.

База знаний и eval остаются отдельными направлениями. Декларативные workflows
уже исполняются через перечисленные выше compiler/runtime и Payload owners;
набор поддержанных capability/check bindings определяется их фактическими
dispatchers. Доступ к инструментам и approvals задают существующие серверные owners.

## Delivery и эксплуатация

- `Dockerfile`, `compose.yaml`, `.dockerignore` — production-like container
  baseline и single-host PostgreSQL/web stack.
- `.github/workflows/ci.yml` — CI gates на чистой PostgreSQL.
- `.github/workflows/release.yml` — OCI build, SBOM/provenance, vulnerability
  scan и staging promotion.
- `.github/workflows/reusable-deploy.yml` — exact-digest SSH deployment.
- `.github/workflows/rollback.yml` — ручной application rollback.
- `scripts/deploy/**`, `scripts/release/**`, `scripts/security/**` — deployment,
  manifest и repository-security owners.
- `scripts/migrations/**` — backup/restore proof, semantic schema evidence и
  guarded adoption существующей schema-push БД.
- `src/app/(app)/api/health/**` — liveness/readiness.
- `documentation/delivery/**` — operator runbooks.

## Tests

- `tests/int/**` — contracts, capability/config foundation и Config API,
  migration/access/plugin,
  Context Pack, execution/promotion worktrees, reviewer parsing и runtime
  primitives.
- `tests/e2e/**` — browser smoke tests и real API approval regression.
- Browser evidence для `/admin/ai` хранится в
  `documentation/reports/evidence/**`.

## AI-layer

- `.ai/**` — активные rules, checks, workflows, roles и local agent tools.
- `.codex/**` — Codex adapters к active AI-layer.
- [.ai-workspace/](../../.ai-workspace/README.md) — локальные материалы задач
  агентов: референсы, скриншоты, снимки страниц, логи и черновики. Содержимое
  задач исключено из Git; постоянные документы хранятся в `documentation/`.
- `AGENTS.md` — корневой entrypoint.
- `documentation/project-context.md` — канонический контекст проекта.
- `documentation/specifications/**` — нормативные product/architecture specs.

AI-layer audit от 2026-08-17 сохранён как historical evidence в
`documentation/reports/AI-LAYER-FOREIGN-ARTIFACT-AUDIT.md`. Текущее
состояние определяется active `.ai/**`, `.codex/**` и фактическими paths,
а не исходными findings отчёта.

## Принципы владения

- Payload schema/config/access меняются в активном `src/**` owner или через
  plugin transformer; generated artifacts обновляются только генераторами.
- Public contracts не отдают raw Payload documents; DTO и mapper имеют явного
  owner-а.
- Search/indexing остаётся derived layer, Payload/PostgreSQL — source of truth.
- Product UI не смешивается с Payload Admin plugin UI.
- Production release — immutable digest; migrations выполняются до web
  rollout, rollback не rebuild-ит image.

## Общий UI-кит

`packages/ui-kit` (`@realize/ui-kit`) владеет семантическими токенами,
темой и общими кнопками, полями, статусами и поверхностями.
`packages/payload-ai-plugin/src/admin/AdminUiTheme.component.tsx` связывает
его с темой Payload. Чат, каталог интеграций и настройки GitHub и Codex используют
общие компоненты. Контракт и границы миграции — [UI-кит](ui-kit.md).

# Структура проекта (источник для AI-layer)

- **Статус:** current implementation
- **Дата сверки:** 28 октября 2026 года (ENG-09: exact-version edit; ENG-10 частично: move/quarantine regular files и project move с metadata/references в complete host-области; прочие разделы сохраняют прежнюю область сверки)

## Активный продуктовый контур

- `src/app/(app)/**` — public site текущего e-commerce-профиля и application
  API routes.
- `src/app/(payload)/**` — generated Payload Admin/API bridge; generated
  page/layout вручную не редактируются.
- `src/app/(system-admin)/**` — authenticated System Admin shell, Мастерская,
  постоянный Task Manager `/system/task-manager` и `/system/appearance` с
  actor-bound `/system/appearance/preview/[planId]`; reference остаётся отдельным маршрутом.
- `src/payload.config.ts` — root Payload config и migration owner.
- `packages/element-registry/**` — первый срез общих identity/owner contracts,
  immutable compiled snapshot и lookup без Payload/React/AI runtime. Host entry —
  `src/registry/realizeOwnerRegistry.config.ts`, пять source mappings —
  `src/registry/realizeElementOwnerBindings.config.ts`. Это отдельный read-only
  compiled entry; startup-интеграция и полный каталог компонентов не внедрены.
  Область проверки от 17 ноября 2026 года —
  [отчёт](../reports/2026-11-17-element-owner-registry-first-slice.md).
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
- `packages/payload-access-management/**` — закрытое хранилище scoped credentials,
  device authorization и CLI refresh; публичные DTO в `./contracts`, endpoint-local
  проверка bearer в `./server`. Host — `src/plugins/accessManagement.config.ts`,
  интерфейс — `src/components/admin/access-tokens/**`, маршруты `/system/access`
  и `/system/access/device`. Контракт — [доступы платформы](platform-access.md).
- `packages/payload-extension-manager/**` — независимый от AI compiled каталог,
  отдельный `admin-shell/` lifecycle host choice и общий strict-codec persistence kernel,
  browser-safe contracts, pure appearance plans и server facade. Две hidden
  state/receipt collections и `src/persistence/` владеют PostgreSQL CAS/UUID replay;
  host registry/scope/ACL — `src/plugins/extensionManager.config.ts`, UI/controller —
  `src/components/admin/extensions/`. Source migration —
  `src/migrations/20261012_094626_extension_manager_state.*`; main apply не выполнен.

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
`admin/mcp-servers/`. Политика чтения репозитория принадлежит `services/ai-control-plane`.
Тип `RepositoryReadPolicy` и фабрика `createRepositoryReadPolicy` доступны через
`realize-ai-platform/repository-read-policy`. Диагностические скрипты отдельного пакета
`agent-search` импортируют тот же [публичный файл сервиса](../../services/ai-control-plane/repositoryReadPolicy.index.ts).
S1 resolver/read инструкций размещён в `services/ai-control-plane/src`,
machine Git HEAD/status/diff — в `.ai/tools/git-delivery/src/read/`.
Общий process/lock owner — `packages/git-runtime` (`@realize/git-runtime`):
его напрямую используют IDE Git-обработчик, execution/preview/SourcePromotion,
release candidate и проверка секретов,
Payload Git endpoint и machine read ports платформы/GPT. Проверки разрешений,
scope и evidence принадлежат соответствующим адаптерам; пакет не импортирует
control plane и не предоставляет модели произвольный Git CLI. Детали —
[ADR-0016](decisions/ADR-0016-development-git-delivery-handler.md).
Общий владелец выполнения проверок и receipts — `packages/verification-runtime`
(`@realize/verification-runtime`). IDE CLI и Git evidence adapters находятся в
`.ai/tools/git-delivery/src/{verification,worker/verification}`; platform policy,
mapper и подключение к execution/preview — в `services/ai-execution-worker/src`.
Разрешения и публикация результатов принадлежат вызывающим адаптерам.
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

Целевое расширение инженерных инструментов описано в
[ADR-0019](decisions/ADR-0019-shared-engineering-operations.md): общий файловый
runtime, project binding и наблюдение за архитектурой. Основание
`packages/engineering-runtime` уже создано в ENG-07: `src/contracts` — strict
browser-safe DTO, `src/runtime` — план/preview/state machine/recovery, `src/storage`
— private SQLite journal и workspace lease; `test` — изолированные проверки.
ENG-08 добавляет `src/artifacts` с generic descriptor port, `src/content` с
immutable content, `src/filesystem` с create adapter; ENG-09 добавляет exact-version
edit через atomic exchange и private backup; ENG-10 — core exact-version move и private
quarantine authored files. Project move текущих profiles обновляет metadata пути и
поддержанные references в одном frozen плане при явной complete host policy.
Bounded directory move (до 32 объектов одного owner) и полный receipt покрыты
расширенной матрицей границ, ACL и directory crash/recovery в
`.ai/tools/engineering/test/directoryMoveFailures.test.ts`;
этот срез TASK-68 принят пользователем 29 октября. Ограниченное изменение регистра
basename использует тот же namespace guard и native rename; project naming guards
сохраняются. Матрица `caseOnlyDirectoryMove.test.ts` принадлежит тому же test owner;
приёмка расширения и всего ENG-10 ещё ожидается.
Публичную проекцию changedArtifacts формирует
`src/runtime/mapChangedArtifacts.mapper.ts`, tree version и durability —
`src/filesystem/readFilesystemTree.service.ts` и `syncFilesystemTree.adapter.ts`.
Каталоги `src/native` и `native` содержат загрузчик и
исходник Linux Node-API primitive.
Публичные входы — `engineeringRuntime.contracts.index.ts` и
`engineeringRuntime.server.index.ts`. Готовность и ограничения —
[протокол, §12–15](engineering-operations.md#15-перенос-и-quarantine-authored-файлов-eng-10).
`.ai/tools/engineering/src/projectEngineering.index.ts` — project binding
`source.util` / `ai.template`, folder policies, move resolvers и чистые renderers; API и
ограничения описаны в [README](../../.ai/tools/engineering/README.md).
Host activation и новые CLI/Admin/MCP clients ещё планируются; бинарник
native backend собирается явно в private location вне checkout.
Task Manager, доступы, Git и verification сохраняют существующих владельцев.

Типы файлов, native metadata, назначение папок и границы authored/generated
описаны в [контракте артефактов](engineering-artifacts.md) (ENG-03): широкий
каталог остаётся целевым, §8 фиксирует два поддержанных profiles ENG-08.

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

`packages/template-contracts` — единый serializable manifest/selection API и
публичные React contracts шаблонов; зависимости на Payload/Next/AI отсутствуют.
Первый layout profile также принадлежит этому SDK: pure schema/parser/resolver
на root entry, Node hash compiler на `/layouts/server`.
`packages/template-realizeai-control-panel` — отдельный preview-only пакет нового
шаблона. Его `src/controlPanelLayouts.metadata.ts` и public `/layouts` задают
два draft определения `0.1.0` с exact alias pins; compiled bindings связывают их
с одним стабильным Frame. Общую identity/owner schema предоставляет
`packages/element-registry`. Явные owner registrations/package binding и
отдельный layout catalog hash собираются в `src/registry/`; эти read-only входы
не являются установщиком или подключением к рабочей активации. Контракт —
[спецификация Control Panel](../specifications/realize-ai-control-panel-first-release.md#381-самостоятельные-определения-макетов-и-release-pins).
`packages/template-realize` — самостоятельный первый Admin template package:
manifest, настройки, palette, Button/Input, workspace/auth/status и полный
renderer в `src/layouts/admin/`. UI-kit не импортирует этот пакет.
`src/components/admin/system-shell/` — compiled registry, разрешение оформления,
template provider/host, маршруты и session/ACL. Server reader потребляет public
`@realize/payload-extension-manager/server` после авторизации. Host-owned policy и
dashboard/Proxy adapters выбирают native либо независимый `/system`, где
`src/components/admin/workspace/` содержит входы доступных модулей. При отсутствующей
appearance schema использует built-in fallback, не запускает миграции.
Рабочие модули передают semantic
props; фиксированный reference может использовать пакетные `/ui` детали напрямую.
Persisted назначение обновляется при следующем открытии страницы, не меняя
открытые module controllers. SDK/UI-kit не импортируют concrete template;
extension manager зависит от SDK/Payload/PostgreSQL, а host связывает его с
Realize через public exports. Installer нового кода, Workshop package release
и frontend renderer — следующие этапы. Контракт —
[менеджер расширений](../specifications/extension-management.md#текущий-этап-реализации),
решение — [ADR-0018](decisions/ADR-0018-self-contained-template-packages.md).

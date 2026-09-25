# Аудит проекта, рабочего слоя ИИ и основы внутреннего MCP

- Дата: 20 сентября 2026 года.
- Статус: **Historical evidence** — снимок анализа текущих файлов и выполненных проверок.
- Результат проектирования: [спецификация и ТЗ](../specifications/internal-mcp.md), [план реализации](../specifications/internal-mcp-implementation-plan.md).
- Область: архитектура приложения, системный `.ai/.codex/AGENTS.md`, административный AI runtime, возможности повторного использования для MCP.
- Продуктовый код, зависимости, системные инструкции и данные в этой задаче не менялись.

## 1. Основные выводы

Realize уже имеет работающую по структуре кода CMS/e-commerce основу и значительный административный AI runtime: конфигурационные выпуски, chat profiles, workflow segments, DataOperation, отдельный исполнитель кода и delivery lanes. Новый MCP следует строить поверх этих владельцев. Универсальная бизнес-платформа из продуктового брифа реализована частично: Task Manager и рабочие среды остаются интерфейсным reference, менеджер расширений — черновиком.

Системный рабочий слой подробно описан, но содержит несовместимые действующие требования. Часть правил уже допускает direct/native выполнение; search rule, managed workflow и external skill сохраняют обязательные search-worker/monitor/codex exec. Поэтому декларация полного соблюдения всех текстов одновременно была бы недостоверной. В этой работе использованы актуальные coordination/lifecycle/assignment rules, native handles и отдельные независимые аудиторы; конфликт явно зафиксирован, файлы правил не переписаны.

Входящего MCP нет. Наиболее готовый доменный сценарий — поиск и чтение Pages. Прямое создание draft через MCP обошло бы текущий DataOperation source/approval lifecycle. Файловый каталог и Git inspect пригодны для повторного использования, но оба требуют доработки публичной границы.

Фактические проверки: TypeScript прошёл; 9 адресных test files, 161 тест прошли. Exact runtime check не прошёл: Node/npm в среде отличаются от заданных проектом. Применённые миграции, живая БД, пользовательский UI, текущий Git HEAD и production deployment этим аудитом не подтверждены.

## 2. Метод и пределы полноты

Анализ включал чтение протокола, реестров и применимых правил, scoped поиск актуальных owners, трассировку producer → authorization → service → persistence → DTO, независимые проверки трёх направлений и адресные команды. Архитектурные и контрактные выводы сверены с кодом; наличие файла не выдаётся за успешную работу сервиса.

Инвентаризация системного слоя: **36 правил, 42 проверки, 12 registry INDEX, 7 role cards и mapper, 9 workflow, 11 project skills, 5 tooling owners**. Проверка явных ссылок затронула 179 active Markdown. Инвентаризация tests обнаружила 176 integration spec и 4 e2e spec; это количество файлов, не число выполненных suites.

Не выполнялся построчный security review каждого файла проекта. Не читались реальные `.env`, credentials, private runtime dumps и пользовательские данные. Generated state не использовалось как инструкция. Успешные mock/fixture tests не доказывают конкурентную корректность живой БД. Отсутствие findings в разделе не означает отсутствие всех возможных дефектов.

## 3. Фактическая архитектура проекта

| Контур                 | Текущий владелец                                                                                | Оценка состояния                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Storefront и API       | `src/app/(app)`, `src/components`, `src/providers`, `src/utilities`                             | Активный Next App Router контур                                                     |
| Payload host           | `src/payload.config.ts`, `src/plugins/index.ts`, `src/collections`, `src/globals`, `src/blocks` | Реальные коллекции, hooks/access, plugin composition                                |
| AI DTO                 | `packages/ai-contracts`                                                                         | Versioned intents, configuration и run/workflow contracts                           |
| Политики и transitions | `packages/change-engine`                                                                        | Hashes, capability registry, config compiler, workflow transitions                  |
| Admin AI               | `packages/payload-ai-plugin`                                                                    | Hidden collections, authenticated API, chat/settings/runs UI, Data Lane             |
| Codex transport        | `packages/codex-adapter`                                                                        | App Server, отдельные profiles, permissions, read tools                             |
| Control plane          | `services/ai-control-plane`                                                                     | Локальные turns, Context Pack и attachments; активное состояние частично in-memory  |
| Исполнитель кода       | `services/ai-execution-worker`                                                                  | Queue, worktrees, проверки, preview, promotion/release candidates                   |
| Общий UI               | `packages/ui-kit`                                                                               | Общие tokens, themes и компоненты                                                   |
| Доставка               | `scripts`, `.github/workflows`, Docker/Compose                                                  | Реализованный набор build/release/deploy механизмов; живое окружение не проверялось |

Манифест задаёт Next `^16.3.1`, React `^19.2.8`, Payload `^3.88.0`, TypeScript `^6.0.3`; это declared constraints, а не утверждение о фактически развёрнутых версиях. Exact Node/npm baseline задан отдельно: `24.18.0`/`11.15.0` ([package.json](../../package.json), [README](../../README.md)).

Корневая Payload config регистрирует Users, Pages, Categories и Media; ecommerce/forms добавляются plugins. Список модулей нельзя строить только по непосредственному массиву collections или по меню интерфейса. `src/RealizeCore` и `src/app/_realize` исключены из активного контура; найденные там Elasticsearch/Redis/PostGIS примеры не подтверждают текущую интеграцию этих сервисов.

Миграции и эксплуатационные runbooks существуют, но `payload:migrate:status` не запускался, поскольку для аудита не требовался доступ к настоящему окружению БД. Текущее состояние schema/data и работоспособность remote delivery остаются непроверенными.

### 3.1. Task Manager, рабочие среды и расширения

`src/components/admin/task-manager/reference/taskManager.store.ts:13` клонирует `initialPrototypeState` и хранит данные в памяти workbench. Fixtures явно вымышленные. Вход в reference защищён настоящей `requireSystemAdmin`, но это не серверные Task/Project/Workspace ACL.

Документация подтверждает отсутствие persistence и API рабочих сред: [Task Manager](../specifications/task-management.md), разделы около строк 669 и 710. [Менеджер расширений](../specifications/extension-management.md) имеет статус неутверждённого draft, runtime installer не реализован.

**Следствие:** MCP не должен возвращать демонстрационные задачи как реальные данные, создавать собственную коллекцию задач или объявлять workspace isolation реализованной. Существующий execution `workspaceID` обозначает checkout/worktree, а не пользовательский tenant.

## 4. Системный рабочий слой

### 4.1. Ответственность

`AGENTS.md` задаёт вход; `.ai/rules` — требования; checks — критерии; workflows — последовательность; registry — discoverability; roles — ответственность; `.codex` — процедурные адаптеры. Документы продукта находятся в `documentation`, локальные материалы — `.ai-workspace`, mutable runtime — у соответствующего tooling owner.

Основные полезные свойства: source-first анализ, сохранение стека и чужих изменений, DTO без raw Payload, conditional verification по scope, разделение development/product permissions, обязательные проверки зависимости перед рекомендацией версии, защищённое хранение секретов, отсутствие разрешения на commit/push по факту завершения задачи.

### 4.2. Реестр найденных проблем

P1 — существенный конфликт исполнения или архитектурной границы; P2 — функциональный/документационный долг; P3 — локальная согласованность. Это приоритет исправления, не заявление об эксплуатации уязвимости.

| ID     | Приоритет | Подтверждённый факт                                                                                                                                               | Следствие и владелец исправления                                                                      |
| ------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SYS-01 | P1        | `RULE-WORKER-DIALOG-COORDINATION.md:18–26` разрешает direct/native и основной поиск; `RULE-SEARCH-SCOPE-DISCIPLINE.md:33,199–225` требует отдельный search-worker | Конфликт внутри rules; согласовать search rule/check/tool с coordination owner                        |
| SYS-02 | P1        | Lifecycle rule разделяет native/external/optional managed; `worker-session/WORKFLOW.md:23,91,160–164` требует runtime/monitor и запрещает spawn_agent             | Выбор workflow меняет обязательный процесс; обновить workflow по rule-владельцу                       |
| SYS-03 | P1        | `codex-external-worker-session/SKILL.md:57–77,138` требует coordinator-only, старые model IDs, budgets/grants и monitor                                           | Adapter расходится с правилами assignment/model/context/lifecycle; не переносить требования на native |
| SYS-04 | P1        | `RULE-AGENT-MONITOR-SERVICE-LIFECYCLE.md:31–34` распространяет preflight и запрет spawn_agent без корректного ограничения режима                                  | Уточнить применимость optional managed, синхронизировать checks                                       |
| SYS-05 | P2        | Agent-search `domain/payload/search-layer` ссылаются на отсутствующий `src/domain` и старые docs/routes                                                           | Три режима реально завершаются exit 2; исправление у agent-search и search rule                       |
| SYS-06 | P2        | Search `code/code-docs` не включает `packages/services`; CLI принимает extra path, ограничивает вывод после полного stdout                                        | Пропуск основной AI реализации; CLI не является готовой security boundary MCP                         |
| SYS-07 | P2        | 7 active refs и ещё 2 refs runtime README ведут в отсутствующий `documentation/project/specs/ai-engineering-workflow`                                             | Невыполнимые обязательные ссылки; найти существующих владельцев, не создавать декоративные specs      |
| SYS-08 | P2        | Monitor lifecycle — единственное из 36 rules, не упомянутое в registry                                                                                            | Неполная discoverability; agent-runtime registry owner                                                |
| SYS-09 | P2        | Evolution WORKFLOW требует два места результата и observation/proposal/applied trace; дочерний gate и docs-sync skill отменяют обязательность trace               | Обновить основной workflow; state intake ссылается на отсутствующий короткий route                    |
| SYS-10 | P3        | State-machine перечисляет общий CI/commit_push, main-delivery делает delivery условным; `.codex/STRUCTURE` неполно показывает frontend artifacts                  | Согласовать карты с реальными entrypoints                                                             |
| SYS-11 | P3        | В выборке 4 source files header checker нашёл 6 нарушений в двух legacy `.mjs`                                                                                    | Исправлять при относящейся правке; не расширять текущую задачу массовым форматированием               |

Основные источники: [coordination rule](../../.ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md), [lifecycle rule](../../.ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md), [search rule](../../.ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md), [worker workflow](../../.ai/workflows/core/worker-session/WORKFLOW.md), [external skill](../../.codex/skills/codex-external-worker-session/SKILL.md), [monitor rule](../../.ai/rules/agent-runtime/RULE-AGENT-MONITOR-SERVICE-LIFECYCLE.md).

SYS-07 относится к отсутствующим DOC-SYSTEM-SPEC-031/032/042. Примеры потребителей: monitor rule:11, runtime maintenance WORKFLOW:9, maintenance report CHECK:14, role template:13, runtime README:8. Generated `current-sessions.json` не считался сломанной исходной ссылкой: это создаваемая projection.

SYS-11: `.ai/tools/agent-search/bin/agent-search.mjs` и `.ai/tools/agent-runtime/src/runtime-gateway/http-routes.mjs` нарушают отдельный date/version и русский description. Проверенные современные Git/Codex adapter files прошли. Это ограниченная выборка, не полный header audit.

### 4.3. Tooling и MCP boundaries

`agent-runtime` хранит локальные sessions/messages/notifications; `agent-monitor` показывает их; `agent-search` оборачивает scoped rg; `git-delivery` исполняет разрешённые Git operations; `source-headers` проверяет conventions. Эти инструменты не управляют Payload AI runtime автоматически.

Gateway runtime защищён loopback, но рассмотренный HTTP command handler не имеет продуктовой user authentication. Его command dispatcher нельзя публиковать как MCP authorization layer.

`.codex/config.toml` объявляет три project-specific MCP: Playwright, Tailwind, Next DevTools. Входящий Realize/Payload MCP отсутствует. Session/plugin tools текущего окружения не являются дополнительными project config entries.

Продуктовый Codex adapter запускает `mcp_servers={}` (`JsonLineRpcClient.adapter.ts:27`) и блокирует `mcpToolCall` (`OpenAICodexAdapter.ts:261`). Уже существующие native read tools разрешены только в `analysis-readonly`, привязаны к thread/turn и имеют budgets.

Их timeout через Promise.race (`CodexReadTools.adapter.ts:160`) не отменяет backend I/O: callback не получает AbortSignal, счётчик освобождается в finally. Поэтому эти числа нельзя перенести в MCP как доказанный предел фактически работающих операций.

## 5. Административный рабочий слой ИИ

### 5.1. Конфигурация и версии

Реализованы восемь installation artifacts: agent_profile, local_role, skill, local_rule, prompt_template, workflow_definition, capability_binding, check_binding. Local role влияет на инструкции, а не на authorization roles Users.

Config API действительно создаёт mutable draft, валидирует, формирует immutable release и отдельно активирует его. Active pointer — append-only версия с CAS; создание выпуска не переключает runtime. `aiConfigActivationHandler.controller.ts` проверяет manifest, pointer version, release hash и совместимость профилей. `aiConfigReplay.ts` связывает actor/action/resource/request hash с durable результатом под PostgreSQL lock.

Registry исполняемых возможностей задаётся `packages/change-engine/src/systemCapabilityRegistry.ts`, а не автоматически читается из Markdown `.ai`. Компилятор сужает capability scopes/maxTargets относительно system ceiling и фиксирует exact versions/hashes. Объявленный binding не создаёт executable capability.

Ограничения: bootstrap загружает последние 100 drafts и 100 releases; UI pagination не подтверждает полную pagination архива. Config idempotency event key глобально уникален внутри установки, хотя replay проверяет actor; будущему MCP нужен собственный server namespacing ключей. Общая knowledge base и eval suite ещё не реализованы; ограниченные PageKnowledge/schema guides существуют и не равны общей базе знаний.

### 5.2. Чат, identity и provider

Все AI permission callbacks текущего host требуют admin (`src/plugins/index.ts:50–62`). Users имеет роли admin/customer. Generic REST/GraphQL CRUD runtime collections закрыт; внутренние repositories часто используют overrideAccess, поэтому endpoint auth и ownership обязательны.

Runtime catalog выдаёт release/profile summary, не private инструкции. Новый run получает immutable compiled snapshot, история сохраняет исходную конфигурацию. Источником прав остаются server policy и actor; текст профиля не выдаёт полномочия.

Codex credentials хранятся в encrypted vault, привязаны к provider/connection; временный profile освобождается после lease. Локальный MCP token не должен использовать или заменять эти credentials. CP bearer — server-to-server credential, а не пользовательская identity.

`services/ai-control-plane/src/runStore.ts:43` хранит текущие runs/events/subscribers в Map. Потерянный активный turn после restart нельзя считать восстановленным только потому, что Payload сохраняет историю. Это ограничение текущего CP, не причина создавать второй MCP runtime.

### 5.3. Workflow

Реализованы сегменты существующего AIRun, закрытый checkpoint, immutable config, owned history, atomic continuation с единственным child, UI registry и limit 64 сегмента. Источники: `chat-context/continueWorkflow.service.ts`, `endpoints/WorkflowRunRegistry.repository.ts`.

**ADM-01, P2 — несогласованная документация:** `documentation/architecture/project-structure.md:172` ещё утверждает отсутствие workflow execution, хотя тот же документ и `project-context.md:393` описывают существующую реализацию. Фактический код подтверждает сегменты; предложение исправить stale paragraph включено в план.

**ADM-02, P1 для сценария Pages → workflow check:** capability executor допускает category assignment, page create и page update (`executeWorkflowCapability.service.ts:39`), а check executor без ветвления парсит category intent и вызывает CatalogCategoryAssignment (`executeWorkflowCheck.service.ts:95`). Page intent будет отвергнут этим parser. Это подтверждённый static gap, а не воспроизведённый end-to-end failure. Текущая suite workflowDataLane проверяет category path; её прохождение не снимает finding. Для read-only MCP это отдельный долг, не блокер A.

### 5.4. Data Lane и Code Lane

DataOperation содержит intent, source, owner, preview, snapshots, hashes, version/expiry и state. Approval связан с exact hash/version; apply повторяет условия, применяет изменение через Payload с access/hooks и объединяет transition/audit/outbox транзакцией. Rollback требует отдельного подтверждения и исходной версии. Publication имеет собственные команды и права.

Page draft creation — реальная реализация (`pageDraftCreation.service.ts:87`), но её прямой вызов не воспроизводит полный пользовательский процесс. Текущие `dataOperationPlanning.ts` и `createTypedDataOperationPlan.service.ts` требуют persisted assistant/workflow source. Поля conversation/sourceMessage обязательны в collection. **MCP-origin отсутствует.** Поэтому tool prepare требует отдельного provenance/schema/UI проекта; tool не может сообщать, что страница уже создана, когда создан только preview.

Code Lane имеет подписанный capability, durable queue claim, изолированные worktrees, exact diff checks, acceptance, independent review, preview и отдельные delivery lanes. Входящий MCP не должен получать workspace-write, shell, создание execution jobs, commit/push или deploy как побочный эффект подключения.

## 6. Что можно повторно использовать для MCP

### 6.1. Repository Context Pack

[projectContextCatalog.service.ts](../../services/ai-control-plane/src/projectContextCatalog.service.ts) реализует root allowlist, deny names/extensions, symlink/hardlink checks, realpath/O_NOFOLLOW, inode/device verification, UTF-8/NUL checks, 2 MiB/file и 50 MiB total, SHA-256 прочитанных bytes. Его потребляет `contextSnapshot.ts`.

Gaps: query ищет по пути, нет content search, line ranges, depth/cursor; API возвращает ограничение 100 без continuation; README.md не входит в ROOT_FILES. Текущая enumeration не покрывает удалённые/index Git paths. Filename deny не является полной классификацией всех private runtime и чувствительного содержимого.

Необходимая доработка: общая policy, проверяемая отдельно от существования файла; point reads и bounded traversal; consistent byte/hash identity. Копирование списка в MCP создаст второй источник истины. Agent-search CLI вместо этой границы использовать нельзя.

### 6.2. Git

[handler.ts](../../.ai/tools/git-delivery/src/handler.ts):145 предоставляет deterministic runDelivery; inspect ветка завершается до journal/staging и не требует модели/БД. [repository.ts](../../.ai/tools/git-delivery/src/repository.ts):307 строит snapshot. Git adapter запускает команды без shell, с budget, literal paths, fsmonitor off и GIT_OPTIONAL_LOCKS=0; lock использует fd существующего каталога и flock.

Gaps: public result имеет cap 200 paths/32 KiB без cursor; bounded text diff отсутствует; Snapshot содержит private absolute paths. `scope:all` читает changed bytes до фильтрации — для MCP поздняя фильтрация небезопасна. Package не имеет подходящего server exports и находится вне root workspaces. Реализация проверяется на Linux.

`services/ai-execution-worker/src/worktree.ts` использовать нельзя: captureWorktreeDiff через changedPaths выполняет git add -N и меняет индекс. MCP status/diff должен оставаться read-only.

Новый deterministic machine caller технически возможен, но текущий [Git rule](../../.ai/rules/git/RULE-GIT-DELIVERY.md) требует worker для операций рабочего слоя. Предлагаемый read port требует отдельного contract/ADR и синхронизации правила. В этом аудите прямой обход не выполнялся.

### 6.3. Pages

| Owner                                                  | Что уже есть                                          | Ограничение                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `chat-context/listPageDrafts.repository.ts:11`         | Поиск title/slug, 20 items, DTO, overrideAccess:false | Нет произвольной collection/query                                                |
| `endpoints/pageDraftUpdate.service.ts:47`              | Text snapshot с fingerprint                           | 128 полей/64 KiB text, optional knowledge до 48 KiB отдельно; требует update ACL |
| Тот же owner:67                                        | Structure portions                                    | 32 placements, offset/fingerprint/catalogHash                                    |
| `chat-context/pageDraftContextEndpoints.controller.ts` | Browser routes с user/data-manager checks             | Дополнительно зависит от enabled Codex runtime                                   |
| `chat-context/pageDiscoveryAuthorization.service.ts`   | Настоящий user/PayloadRequest                         | Native tool grant связан с run; не универсальный MCP bearer                      |

Нужен узкий server facade plugin, который получает проверенный credential → существующий actor, сохраняет ACL, но не требует модели только ради чтения. Нельзя deep-import произвольные repositories с overrideAccess, синтезировать admin или создавать фиктивный AIRun для callback.

## 7. Исправления предварительного ТЗ

| Предположение референса                            | Исправление                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| «Приступай к реализации»                           | Текущий пользовательский запрос — анализ и подробный проект задания                            |
| Любые задачи/документы/проекты                     | Только фактически реализованные Pages; reference fixtures исключены                            |
| Рабочие среды как готовая security модель          | Одна установка и реальные Users/ACL; не вводить вымышленные workspace grants                   |
| Создать draft, если service существует             | Сначала сохранить DataOperation provenance/approval; прямой CRUD недопустим                    |
| `@modelcontextprotocol/sdk` как неизменный выбор   | Проверить текущую ветку SDK; на дату анализа v2 stable и иной package layout                   |
| Initialize как единственная проверка               | Две явно проверяемые protocol eras, legacy stateless и modern discovery                        |
| Общий repo root и post-filter Git diff             | Проверка policy до bytes, включая index/deleted/rename                                         |
| `.ai` как обычное дерево файлов                    | Отдельный developer grant на инструкции, запрет runtime/секретов; не передавать Admin права    |
| Локальный token достаточно для данных              | Серверное сопоставление с конкретным существующим actor, повторная проверка прав               |
| Новый MCP может использовать старые tools напрямую | Native Codex callbacks и Git worker routes имеют собственные contracts                         |
| Пример `docs/mcp.md`                               | Постоянные материалы принадлежат `documentation`                                               |
| Работает HTTP — значит готов ChatGPT               | SDK protocol tests отдельно; ChatGPT transport/auth/аккаунт и реальные вызовы — следующий этап |

Внешние версии и правила protocol compatibility сверены с официальным [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [MCP transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports) и [SDK compatibility](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html). Полные результаты registry и проектное решение записаны в §5 спецификации.

## 8. Реально выполненные проверки

| Проверка                                                       | Результат                                                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run verify:runtime`                                       | FAIL: требуется Node 24.18.0/npm 11.15.0; среда 24.19.0/11.17.0                                                       |
| `npm run typecheck -- --incremental false --pretty false`      | PASS, exit 0, без incremental cache                                                                                   |
| 9 targeted integration suites с `DOTENV_CONFIG_PATH=/dev/null` | PASS: 161 тест, 9 файлов, 5.32 секунды                                                                                |
| Active Markdown references/registry inventory                  | Найдены SYS-07/SYS-08; scope 179 файлов                                                                               |
| Agent-search domain/payload/search-layer                       | Все три exit 2; отсутствующие include paths                                                                           |
| Agent-search extra path dry-run                                | Подтверждено отсутствие containment на этой границе; внешние файлы не читались                                        |
| Source headers, выборка 4 файлов                               | 6 нарушений в двух legacy files; два современных файла прошли                                                         |
| `monitor-service-status --json`                                | pass:false, monitor_service_lifecycle_unavailable; 8765/5173 ECONNREFUSED, heartbeat отсутствует                      |
| Runtime active rows внутри status                              | 0 active/unresolved sessions/groups, 0 working presence; это не native agent registry                                 |
| Git inspect                                                    | Не запускался: REALIZE_GIT_CODEX_HOME не задан; подстановка личного профиля и прямой Git запрещены текущим контрактом |

Выполненные suites:

```text
tests/int/control-plane-context.int.spec.ts
tests/int/pageDraftContracts.int.spec.ts
tests/int/pageDraftUpdateContracts.int.spec.ts
tests/int/pageDiscoveryContracts.int.spec.ts
tests/int/pageDraftChatContext.int.spec.ts
tests/int/pageDiscoveryPlugin.int.spec.ts
tests/int/workflowDataLane.int.spec.ts
tests/int/ai-config-api.int.spec.ts
tests/int/ai-config-activation.int.spec.ts
```

Они используют temporary filesystem, pure contracts и test doubles. В процессе выдано предупреждение Vite о встроенном tsconfig paths и ненужном plugin; конфигурация не менялась, на результат suite предупреждение не повлияло. Проверки пройдены в среде с несовпадающими exact versions, поэтому release/CI readiness не объявляется.

Полный lint/build/all tests/e2e не запускались: задача меняет документацию, а диагностическая выборка ограничена архитектурными рисками MCP. Для независимой оценки UI, production deployment, DB concurrency и общего release состояния нужны отдельные доказательства. MCP-клиент не запускался: сервера пока нет.

## 9. Приоритеты следующей работы

1. Согласовать прямой/native/managed порядок и правила поиска; устранить связанные stale references без нового слоя runtime.
2. Зафиксировать developer repository access, Pages actor mapping и read-only Git machine-caller контракт.
3. Реализовать выпуск A по отдельным проверяемым этапам, сохранив существующих owners.
4. После A отдельно расширить provenance DataOperation и Admin review для выпуска B.
5. Отдельно исправить ADM-02 и актуализировать связанные workflow tests; не смешивать этот дефект с read-only MCP.
6. После локального proof проектировать ChatGPT transport/auth. Не публиковать developer repository tools автоматически вместе с административным доступом.

Ни один пункт этого отчёта сам по себе не предоставляет дополнительных разрешений на изменение runtime, данных или доставку. Конкретная последовательность, зависимости и критерии завершения определены в [плане](../specifications/internal-mcp-implementation-plan.md).

## 10. Дополнение после уточнения функциональной цели, 20 сентября 2026 года

Пользователь уточнил: внутренний MCP должен стать максимально функциональным и встроенным в системный рабочий слой. В версии 0.2 [спецификации](../specifications/internal-mcp.md) и [плана](../specifications/internal-mcp-implementation-plan.md) чтение repo/Pages оставлено технической стадией A; обязательный системный выпуск S охватывает инструкции, task artifacts, реальные checks/agents, изменения и разрешённую Git delivery. B/P расширяют административные сценарии. Приоритеты §9 отражают исходную узкую постановку; текущая программа определяется актуальным Draft, а не этим historical snapshot. Последующее уточнение управления серверами зафиксировано в §11.

Дополнительное чтение исходников и независимые native audits подтвердили следующие границы. Это static evidence; новые вызовы модели, БД, Git и runtime mutation tests не выполнялись.

| Наблюдение                                                                                                                                | Проверенный источник                                                                                          | Следствие для расширения                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `request_worker` создаёт запрос; `stop` возвращает `process_stop_executed:false`; `accept_result` изменяет session/presence/notifications | `.ai/tools/agent-runtime/src/runtime-store/operator-command-dispatcher.mjs`                                   | Coordination нельзя выдавать за настоящий executor; acceptance требует write grant                                             |
| Runtime CLI открывает store с initialization до status; отдельный read-only open уже поддержан                                            | `.ai/tools/agent-runtime/bin/agent-runtime.mjs:75`, `.ai/tools/agent-runtime/src/runtime-schema/index.mjs:27` | Новый read facade должен использовать `readOnly:true, initialize:false`; отсутствие БД не вызывает bootstrap                   |
| Config validate пишет event и при успехе переводит draft в ready с новой revision                                                         | `packages/payload-ai-plugin/src/endpoints/aiConfigReleaseHandlers.ts:47`                                      | Это mutation, а не read-only check; нужны write annotation и replay                                                            |
| Config activate/rollback имеют manager ACL, hashes/CAS/replay; отдельного human approval aggregate нет                                    | `packages/payload-ai-plugin/src/endpoints/aiConfigActivationHandler.controller.ts:56`                         | Для agent execution нужен явный trusted authorization contract; роль admin не доказывает намерение активировать данный release |
| GET run events сохраняет provider events и меняет run state                                                                               | `packages/payload-ai-plugin/src/endpoints/stream.ts:57`                                                       | Read tool истории должен использовать bounded stored-event read, не обёртку stateful stream                                    |
| **ADM-03, P1 перед Code Lane MCP:** protected prefixes не включают корневой AGENTS.md                                                     | `packages/change-engine/src/executionPolicy.ts:10`, `:79`                                                     | Статический gap; до P3 нужны regression и fail-closed policy для системного слоя. Runtime exploit не воспроизводился           |
| Code Lane create требует настоящий assistant sourceMessage и preceding user request                                                       | `packages/payload-ai-plugin/src/endpoints/changeRepository.ts:191`                                            | MCP-origin требует provenance/DTO/ownership/review расширения, как DataOperation; фиктивные сообщения не подходят              |

Native agent handles принадлежат среде исполнения. Наличие runtime SQLite и локального MCP не предоставляет standalone серверу доступ к ним. В полном S требуется настоящий поддержанный executor; недоступный native bridge обозначается отдельно. Task/check/patch фасады пока отсутствуют и описаны как новая реализация у соответствующих владельцев.

## 11. Дополнение: настройки нескольких MCP в Admin, 20 сентября 2026 года

Пользователь потребовал управление настройками MCP в админке и расширение на несколько серверов/типов. В Draft 0.3 добавлен обязательный G: каталог экземпляров и detail settings, права/credentials, проверка и подтверждённое применение. Первая поставка стала A+G; код UI/сервера этим уточнением не реализован.

Повторный scoped анализ существующих owners подтвердил:

- `packages/payload-ai-plugin/src/collections/integrations.ts` уже имеет provider text, unique connectionKey, configuration JSON и revision. Однако `packages/ai-contracts/src/integrations.ts`, `loadIntegrationCatalog.service.ts` и Admin state поддерживают только GitHub/Codex primary. Новый MCP каталог требует instance-aware queries/DTO/client state, не просто третьей карточки.
- `integrationRepository.ts` предоставляет CAS, `integrationHandlerSupport.ts` — транзакции/replay. Replay scope пока не включает connectionKey, а idempotencyKey глобально уникален в integrationEvents. Это недостающая защита будущего multi-instance пути, не воспроизведённый дефект нынешнего primary-only UI.
- `credentialVault.ts` подходит для outbound credentials с provider/connection AAD. Inbound MCP client verifiers и service apply receipts пока отсутствуют. Audit action enum ограничен saved/tested/disconnected, actor требует настоящего Users; новые lifecycle действия нуждаются в owner/schema решении.
- Действующий navigation owner `admin/useRealizeAINavigation.hook.ts` имеет группу «Настройки». В нём и в `realizeAIPlugin.plugin.ts` размещается новый рабочий view. `src/components/admin/system-shell/systemAdminAI.navigation.tsx` относится к отдельному reference; его ссылка не делает новую оболочку production Admin.
- Настройка подключения в registry не предоставляет standalone процессу controller и не включает outbound MCP в `packages/codex-adapter`. Для config apply/status и для consumer calls нужны разные явные bridges.

Официальные Payload/Next MCP материалы сверены для классификации adapters; ссылки и границы применения находятся в §19 спецификации. Plugin, новые endpoints, DB schema, inbound keys и process controllers не устанавливались. Новое дополнение проверено чтением кода и независимыми native assignments; app tests, browser, live DB, модель и Git повторно не запускались.

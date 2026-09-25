# Контекст проекта: Realize

- **Статус:** current implementation
- **Дата сверки:** 25 сентября 2026 года (MCP A+G+S1, предустановки и настройка ChatGPT в Admin)

## Цель проекта

Realize — AI-управляемая CMS-платформа для сайтов разных типов. Текущий
репозиторий реализует первый e-commerce-профиль: каталог, storefront, корзину и
checkout. Целевая архитектура отделяет универсальное ядро управления
content/data/schema/design/code/delivery от профильных commerce-модулей.

Текст target specification не является доказательством runtime. Эта страница
фиксирует только подтверждённое состояние текущего checkout.

## Технологии и runtime baseline

- Frontend: Next.js 16.3, React 19.2, TypeScript, Tailwind CSS, App Router.
- Backend/data: Payload CMS 3.88, PostgreSQL и versioned Payload migrations.
- Schema push по умолчанию отключён во всех средах и разрешается явным
  `PAYLOAD_DB_PUSH=true` только для disposable local DB.
- Runtime: Node.js 24.18.x и npm 11.15.x.
- Delivery: Docker/Compose, GitHub Actions, GHCR и exact-digest deployment на
  Linux VPS.
- Tests/evidence: Vitest и Playwright.
- В execution worker MCP не является разрешённым runtime capability. В
  project Codex adapter настроены отдельные development MCP для browser/UI/Next
  tooling и локального Realize Internal; Payload MCP endpoint сейчас отсутствует.
- Отдельный `services/internal-mcp` предоставляет loopback `/mcp`: bootstrap
  repository-only либо managed instances из «Настройки → MCP-серверы».
  Реализованы Repo/Git/Pages read, client keys, CAS/replay и подтверждённое apply.
  S1 добавляет bounded resolver исходных инструкций, чтение по hash и каталог
  разрешённых capabilities. Смысловая применимость требует review; прямое
  чтение тех же источников остаётся fallback. Локальный development Codex
  подключён к отдельному bootstrap service без Pages и БД;
  инструкции запуска — [MCP tooling](architecture/mcp-tooling.md).
  Предустановки добавляются при manager login или явной установке без сброса
  настроек. В форме ChatGPT клиент сохраняет Tunnel ID и ключ в зашифрованный
  vault выбранного instance; managed supervisor ведёт Secure MCP Tunnel; реальная облачная приёмка ждёт данных аккаунта/tunnel.

## Активный контур приложения

- Storefront и application routes: `src/app/(app)/**`.
- Payload bridge: `src/app/(payload)/**`.
- Payload config/schema: `src/payload.config.ts`, `src/collections/**`,
  `src/plugins/index.ts`.
- Фактические shared UI owners: `src/components/**`, `src/providers/**`.
- Миграции: `src/migrations/**`.
- Workspace packages: `packages/**`.

`src/RealizeCore/**` и `src/app/_realize/**` quarantined по ADR-0001. Пути
`src/domain/**`, `src/ui/**` и root `src/app/api/**` сейчас не являются
фактическими active owners, даже если встречаются как target architecture в
старых AI-layer artifacts.

## Предпросмотр контента витрины

Payload Admin формирует ссылки `/next/preview` для страниц и товаров. Вход
требует непустой `PREVIEW_SECRET`, действующей сессии пользователя `users` с
ролью `admin` и внутреннего пути без внешнего адреса, query, fragment или
неоднозначных разделителей. При отказе cookie предпросмотра отключается.

Cookie `draftMode` задаёт режим, но не предоставляет права. Общий resolver
`src/utilities/preview/findPreviewDocumentBySlug.service.ts` повторно проверяет
пользователя при каждом чтении документа, включая metadata, и всегда применяет
Payload access через `overrideAccess: false`. После выхода, истечения сессии
или отзыва роли оставшаяся cookie не открывает черновики: сервер читает только
опубликованную версию; при её отсутствии маршрут показывает not-found.
Предпросмотр не публикует документ и не меняет его содержимое.

Страницы агента просматриваются через штатный Live Preview Payload в редакторе
Pages. Кнопка глаза переключает панель, открытие новой вкладки и размеры экрана
предоставляет сам Payload. Общий LivePreviewListener обновляет страницу после
сохранения/автосохранения. Собственного visual-preview API, token-маршрута,
панели или отдельного режима renderer у AI plugin нет. В карточке диалога доступны
«Посмотреть в админке» и «Посмотреть на фронте»: первая кнопка открывает редактор,
вторая через проверку владельца операции и Pages ACL перенаправляет на URL,
который выдаёт существующий `Pages.admin.preview`. DTO содержит только безопасную
ссылку перехода `frontendPreviewUrl`, без PREVIEW_SECRET.

В чате сначала готовится публикационный план точной сохранённой версии, затем
пользователь открывает редактор по ссылке из плана, проверяет страницу штатным
Live Preview и возвращается для подтверждения. Нативный preview показывает
актуальный сохранённый draft; любое последующее сохранение закрывает старый план.
Подробнее — [штатный Live Preview](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md#1412-штатный-live-preview-payload).

Публикация из админки выполняется отдельной DataOperation `pages.publishDraft.v1`
с риском R2, host-правом `pageDraft.publication.canPublish`, Pages ACL и подтверждением
просмотра конкретного manifest на компьютере и телефоне без ошибок отображения.
Первый сценарий поддерживает Content/Banner и текстовый hero без изменяемых
зависимостей: Media, Form, активные ссылки и неподдержанные данные блокируют публикацию.
План, подтверждение и применение повторяют проверку выбранной версии. Штатные
Payload validators/hooks выполняются при записи; изменение выбранного содержимого
или ошибка откатывает транзакцию. Обновление кэша выполняется после commit через
существующий audit/outbox; его сбой и повтор отображаются отдельно от сохранённой
публикации. `pages.restorePublication.v1` восстанавливает предыдущую публичную
версию либо снимает первую публикацию, сохраняя рабочий draft. Новые kinds не
предоставлены модели как самостоятельные write intents. Контракт —
[публикация и восстановление](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md#1413-публикация-и-восстановление-публичной-версии-pages).

## Текущий Realize AI slice

Диалоговый runtime остаётся read-only. Чат доступен в правой панели Admin,
контентной области `/admin/ai` и отдельном окне `/admin/ai/window`. Размещение,
поведение диалога и ограничения инструментов настраиваются во вкладках
интеграции GPT — Codex. Контракты,
plugin и Codex adapter разделены по workspace packages; browser общается только
с authenticated Payload API/SSE. Development control plane работает только на
loopback и создаёт ограниченный Context Pack без secrets/binary/runtime state.

Блок ввода поддерживает приватные изображения и текстовые вложения, выбор
безопасных файлов проекта и явное включение встроенного веб-поиска для сообщения.
Изображения передаются Codex как `localImage`; контекст и источники ответа
сохраняются с сообщением. Вложения хранятся в приватном каталоге control plane,
их метаданные и доступ владельца — в Payload. Публичная Media не используется.
Исполнитель кода и reviewer сохраняют отключённый веб-поиск и прежние ограничения.
Форматы, лимиты и хранение описаны в
[интеграции Codex](architecture/codex-integration.md#вложения-и-контекст-сообщения).

Поверх чата реализован approval-gated Change Request: план с exact paths,
проверками, risk level и hashes сохраняется в Payload, а admin отдельно
утверждает или отклоняет зафиксированную версию.

Approval-gated Data Lane поддерживает назначение существующей категории
существующему товару (`catalog.assignCategory.v1`) и создание одного черновика
CMS-страницы (`pages.createDraft.v1`), а также изменение текста существующей
страницы в черновике (`pages.updateDraft.v1`) и одно структурное изменение Content
(`pages.updateStructureDraft.v1`). Агент передаёт только versioned intent;
Payload готовит preview, проверяет access и условия записи, применяет изменение
в транзакции и сохраняет audit/outbox. Применение и откат требуют отдельных
hash-bound подтверждений. Публикация и восстановление используют отдельные
операции из 14.13 и не принимаются как intent модели. Произвольные CRUD,
schema changes, SQL и массовые операции в этот slice не входят.

Для страницы intent ограничен заголовком, `slug`, обычным текстом секций
и SEO-описанием. Host mapper создаёт существующие Content/Lexical поля, а
сервер задаёт статус `draft`. После просмотра полного содержания и двух
действий «Подтвердить создание» → «Создать черновик» администратор получает
ссылку редактора. Обычная контентная страница не создаёт `CODE_CHANGE` job;
ограничение read-only относится к модели, запись выполняет Payload Data Lane.
Откат удаляет только созданный этой операцией неизменённый черновик без истории
публикации. PostgreSQL advisory lock связывает проверки с Pages-записями,
включая autosave до чтения версии. Контракт описан в
[Data/Config Pipeline](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md#145-создание-черновика-cms-страницы).

Редактирование существующей страницы доступно через `pages.updateDraft.v1`.
Страница выбирается в composer либо находится и читается агентом через
серверные инструменты; сервер сохраняет ограниченный текстовый контекст
исходного run. Host-адаптер разрешает точечные
изменения title, SEO и текстовых Lexical leaves hero/Content/CTA/Banner,
сохраняя остальные блоки, ID, media, формы, ссылки и форматирование.
Администратор проверяет полный diff, подтверждает его и сохраняет draft.
Повторная проверка полной ревизии, общей блокировки и прав защищает от
перезаписи новых изменений; откат восстанавливает прежний текст только при
неизменённой применённой версии. Опубликованная запись остаётся прежней.
Публикация страницы через агента пока не реализована. Структурные действия
над Content выполняются отдельной операцией, описанной ниже.
Подробный контракт — [редактирование черновика](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md#146-редактирование-текста-существующей-страницы).

Реализован первый срез контекста Pages, Content и FormBlock: описания рядом
со схемами, производный каталог и порционное чтение структуры с ID размещений,
порядком и разрешёнными ссылками на формы. Описания и guides Pages/Content имеют
версию `1.1`, FormBlock — `1.0`; версии DTO каталога и knowledge остаются `1.0`.
Выбранная страница автоматически
передаёт агенту ограниченный обзор и инструкции. Текстовый v1 сохраняет прежние
лимиты; отдельный endpoint читает структуру большего документа. Модель может
получать следующие порции через `pages_structure`; нового UI дерева пока нет.
Подробности — [каталог и структура Pages](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md#149-каталог-и-структура-pages-первый-реализованный-срез).

В обычном чате подключены `pages_search`, `pages_read` и `pages_structure`:
запрос «найди страницу доставки» может запускать поиск без ручного выбора.
Поиск использует буквальное вхождение в title/slug и возвращает до 20 результатов
с реальными ссылками редактора; полезный термин и альтернативу выбирает модель.
Семантический индекс и гарантии скорости на миллионах страниц не реализованы.
Чтения проверяют текущего администратора, интеграцию, владельца run и Pages ACL;
снимок для предложения изменения должен быть сохранён именно в текущем run.
Закрытый журнал допускает до 12 вызовов, до трёх текстовых снимков и до восьми
порций структуры; два массива снимков вместе ограничены 384 КиБ UTF-8.
Точный повтор структуры возвращает сохранённую порцию только после сверки
текущей ревизии, каталога и доступа к её ссылкам.
Это ограниченные серверные инструменты чтения, без MCP, произвольных tools
или записи из модели. Подробности — [поиск и чтение страниц](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md#1410-самостоятельный-поиск-и-чтение-страниц).

Структурный Data Lane `pages.updateStructureDraft.v1` вставляет, перемещает или
удаляет один Content в черновике. Insert создаёт full-колонку из обычного текста;
move сохраняет непрозрачное содержимое целиком; remove требует полного preview
поддержанных текстовых колонок и имени блока. Ссылки, CSS в текстовых узлах,
вложения и неизвестные данные удалением этого среза не поддержаны.
Цель и якорь задаются stable IDs из сохранённых порций структуры текущего run;
версия страницы и catalogHash проверяются повторно. Карточка показывает точные
позиции и всё добавляемое/удаляемое содержимое. Прежние подтверждения, draft apply,
проверка опубликованной версии и отдельный rollback сохраняются. Workflow,
изменение форм и произвольный layout patch этим срезом не предоставлены.
Контракт — [структурные изменения Content](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md#1411-структурное-редактирование-content).

Для дальнейших этапов спроектирована
[архитектура сервисов страниц](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md#147-архитектура-сервисов-страниц-для-агентов):
контекст и каталог возможностей, подготовка изменений, проверки, предпросмотр
через Payload и отдельная публикация. Контекст, изменения и первый срез
проверок публикации реализованы внутри существующих owners и Data Lane. Публикация
и восстановление доступны для поддержанных статических страниц с отдельным
подтверждением администратора; динамические зависимости и полный набор проверок
готовности остаются целевым проектом. Первый
предметный объект для развития сервисов — страницы.

Целевой проект дополнен
[описаниями модулей, блоков, виджетов и компонентов](specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md#74-элементы-проекта-и-их-связи)
и [выбором сервиса, браузера или разработки недостающей возможности](specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/11-change-engine.md#116-выбор-способа-исполнения).
Производный каталог и инструкции подключены для пилота Pages/Content/FormBlock.
Универсальный каталог всех элементов, делегированный browser-write и полный
engineering workflow ещё не реализованы. Текущие
runtime permissions этим проектом не изменены.

Для локальной разработки добавлен approval-gated code execution foundation. Payload
endpoint только создаёт durable PostgreSQL job и short-lived HMAC capability.
Отдельный `services/ai-execution-worker/**` атомарно claim-ит job, создаёт ветку
и Git worktree вне основного checkout, запускает Codex в `workspace-write`,
проверяет фактические paths, выполняет server-owned checks и сохраняет bounded
diff/evidence. После этого admin принимает или отклоняет уже фактический
результат отдельным hash-bound решением. Принятый exact diff можно отдельно
promote в чистый worktree: worker повторяет проверки, запускает независимый
ephemeral read-only Codex review, создаёт изолированный service commit и
поднимает TTL-bound standalone preview на loopback с sanitized PostgreSQL
clone. Preview readiness и storefront подтверждаются Chromium, после чего
admin принимает или отклоняет exact artifact ещё одним hash-bound решением.

В режиме `local-development` команда `npm run dev` совместно запускает Next,
control plane и execution worker. Общий supervisor загружает одно окружение
через `@next/env`, проверяет параметры и порты, удерживает PostgreSQL session
lock для checkout и запускает worker после health-ответов сервисов. При
остановке он дожидается текущего задания; автоматического повторного получения
незавершённых задач нет. Central/isolated режимы запускают только приложение,
для отдельного Next предусмотрен `dev:web`. Этот локальный запуск не меняет
production Compose и `npm start`.

Из принятого preview доступна отдельная source-control promotion. Payload
создаёт durable `SourcePromotion`, а worker повторно проверяет exact commit и
acceptance hashes, публикует его без force push в детерминированную ветку
`ai/changes/**` и создаёт open draft Pull Request. Результат сохраняется как
redacted hash-bound evidence. Этот lane не изменяет основной checkout, `main`,
не выполняет merge и не запускает release или production deploy.

После `preview_accepted` доступен отдельный provider-neutral release
control-plane. Payload создаёт `ReleaseCandidate`, а execution worker передаёт
exact service commit server-owned executable через JSON-port без shell и с
allowlisted environment. Готовый candidate обязан содержать immutable OCI
digest/ref, manifest hash, SBOM digest, verified signature, migration-set hash
и healthy HTTPS OCI preview. Admin утверждает или отклоняет этот exact artifact
отдельным `RELEASE_APPROVAL`; approval не запускает production deployment.

Local execution/preview worker остаётся trusted development boundary. Отдельный
opt-in GitHub/GHCR adapter реализует release JSON-port: публикует exact service
commit только в scoped candidate ref, запускает trusted GitHub Actions workflow,
проверяет signed immutable digest и разворачивает TTL-bound sanitized HTTPS
preview на VPS Docker Compose. Без `REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND` и
operator-owned GitHub/VPS configuration этот lane выключен fail-closed.

Payload Admin содержит каталог `/admin/integrations`: квадратные карточки
с логотипами, поиск по названию и описанию, фильтр по `connection.enabled`.
Каталог и настройки используют общий `@realize/ui-kit`: семантические токены,
тему, кнопки, поля, статусы и поверхности. Тема Payload подключается отдельным
адаптером; другие экраны и storefront переводятся последовательно.
Карточка открывает отдельную страницу `/admin/integrations/:provider`;
реализованные сервисы — GitHub и Codex. Форма GitHub настраивает репозиторий,
write-only token и автора коммитов. Browser получает
только redacted DTO; credential хранится в installation-local AES-256-GCM vault
с отдельным operator-owned `REALIZE_INTEGRATIONS_ENCRYPTION_KEY`. Включённое
GitHub connection передаётся серверным исполнителям source promotion, release
orchestrator и отдельного Git push; browser и Payload DTO credential не получают. Для
release adapter connection имеет приоритет над legacy repository/token
environment. Provider infrastructure (CLI paths, workflow и timeouts) остаётся
server-owned configuration.

[Интеграция Codex](architecture/codex-integration.md) поддерживает вход через
ChatGPT через браузер или код устройства, API key, Codex access token и
серверный workload identity. Настройки и зашифрованные credentials хранятся
в том же реестре; workload identity получает доступ из серверного окружения
без постоянного секрета в БД. Чат CMS, execution worker и reviewer используют
включённое подключение и отдельный постоянный профиль CMS; обновление токенов
синхронизируется через общую блокировку БД. Личный профиль Codex и ключи из
окружения не подменяют отсутствующее или отключённое подключение. Сам адаптер
отклоняет неявное окружение и отсутствие абсолютного `CODEX_HOME` до запуска CLI.
Вкладка «Агент» управляет единственным `connection.enabled`, моделями, этапами
выполнения и сроками (`configuration.agent`). Настройки читаются перед новыми
действиями и получением задач worker без перезапуска. Старые env-переключатели
и выбор моделей из env удалены; изолированные проверки/preview сохраняют
инфраструктурный запрет. Выключение не закрывает историю, отмену и откат.

Вкладка «Агент» также показывает диагностику: состояние чата, сохранённые
модели, разрешения операций с причинами и последнюю проверку доступа.
`GET /integrations/codex/diagnostics` читает существующие настройки и использует
общую проверку control plane. Кнопка «Проверить доступ» повторно использует
существующую проверку аккаунта и её metadata. Состояние отдельного worker
читается из скрытой коллекции `realize-ai-worker-presence`: heartbeat каждые
5 секунд, порог свежести 20 секунд по часам PostgreSQL, возможности этапов
и текущее задание. Диагностика различает доступность, занятость и недоступность
с причиной; heartbeat не подтверждает успех модели. В чате проверяется
назначенный исполнитель, а сведения о чужих заданиях скрыты. Во время
штатного завершения worker продолжает heartbeat и не получает новые задачи.

Общее серверное чтение подключения находится в
`packages/payload-ai-plugin/src/integrations/runtime/`
(`@realize/payload-ai-control/server/integration-runtime`). `IntegrationRuntimeRepository`
читает PostgreSQL, валидатор проверяет запись, `GitHubConnectionService` получает
credential через существующий vault. Execution worker создаёт репозиторий со
своим Pool и передаёт его вместе с ключом сервису; SQL и расшифровка не дублируются
в операционном слое. Для отдельного push Git-обработчик использует
`GitRepositoryConnectionService`: HTTPS-токен или SSH-профиль выбирается по
настройкам интеграции. Выбор транспорта в Admin UI и объединённый `commit_push`
по ADR-0016 остаются следующими этапами.

Production authorization handoff, deploy/rollback controller и commercial
enforcement в текущий slice не входят. `RELEASE_APPROVAL` по-прежнему не даёт
worker-у production credentials и не запускает rollout.

В `packages/ai-contracts/**` и `packages/change-engine/**` реализован foundation
настраиваемого installation AI-layer: generic exact-version capability registry,
adapters `catalog.assignCategory.v1`, `pages.createDraft.v1` и `pages.updateDraft.v1`, typed skills/prompts/rules/roles,
capability/check bindings, agent profiles и декларативные workflows. Ready draft
можно валидировать, опубликовать как детерминированный immutable release,
проверить по SHA-256 и скомпилировать с exact server-owned system ceiling в
bounded effective projection.

Добавление возможности страницы совместимо с прежним system ceiling `1.0.0`.
Существующие releases и исторические snapshots не переписываются; page binding
не появляется в ранее выбранных профилях автоматически. Новая компиляция
фиксирует актуальный manifest hash расширенного system registry.

Payload persistence/API первого configuration slice также реализованы. Четыре
hidden коллекции хранят mutable drafts, immutable releases, append-only active
pointer history и audit/idempotency events; migration
`20260901_163832_ai_config_persistence` добавляет их в PostgreSQL. Namespace
`/api/realize-ai/config/*` предоставляет bootstrap, create/read/replace draft,
validation, create/read release и отдельные activate/rollback commands через
strict DTO и admin permission. Config mutations используют общую транзакционную
блокировку, optimistic revision, canonical request hash и durable replay.
Активация связывает exact release/hash с новой версией append-only pointer;
rollback выбирает более ранний совместимый выпуск. События добавляет migration
`20260910_122259_ai_config_activation`. Generic Payload CRUD закрыт.

В «Настройки → Агентский слой» (`/admin/ai/settings`) боковая навигация группирует
рабочую область, агентов, инструкции, выполнение и управление. Общий каталог
охватывает все восемь сохранённых видов записей: профили, роли, навыки, правила,
шаблоны инструкций, рабочие процессы, связи возможностей и проверок. В каталоге
есть поиск по названию, ключу и краткому содержимому, фильтры состояния и входящих
ссылок, сортировка и страницы по 25 записей. Каждый каталог сохраняет свой
контекст при открытии записи, возврате и смене раздела в текущей рабочей области.

Доступны типизированный просмотр содержимого и переходы по прямым/обратным связям.
Для больших списков связей есть поиск по названию, ключу и типу; высота списков
ограничена. Есть выбор, создание и копирование черновика, редакторы правил,
профилей, ролей, навыков, шаблонов инструкций, возможностей, проверок и процессов
и серверная валидация. В общем каталоге тип новой записи выбирается в списке;
отдельный каталог показывает
одно действие создания своего вида. Профиль можно создать,
скопировать и изменить, выбрав семь групп связей и рабочий процесс по умолчанию.
Ключ сохранённого профиля неизменяем; копия остаётся локальной формой с новым
ключом до сохранения. Отсутствующие и выключенные цели видимы в выборе связей.
Роли содержат инструкции и связи возможностей, навыки — также назначение
и условия применения, шаблоны — текст, переменные и назначение. Эти три вида
можно создавать, копировать, редактировать и отключать; сохранённые ключи
неизменяемы, копии записываются только после сохранения формы.
Возможности и проверки также можно создавать, копировать, изменять и отключать.
Формы выбирают точную системную возможность с версией или зарегистрированный
ID проверки. Действия, области и лимит объектов сужают системные ограничения;
отсутствующие области наследуют SYSTEM, пустые массивы запрещают их.
Общий список выбора поддерживает поиск, фильтр выбранных и страницы по 25;
отсутствующие сохранённые цели и значения видимы до явного исправления.
Процессы поддерживают создание, копирование, изменение и отключение. Редактор
содержит каталог шагов и форму выбранного шага, шесть типов шагов и три источника
значений. Переименование шага обновляет его переходы, начальный шаг и ссылки
на результат; неподтверждённый ключ и неверный литерал остаются несохранённым
вводом и блокируют отправку. Структурно корректный незавершённый граф допускается
в черновике, полную проверку выполняет сервер.
Все восемь редакторов используют aggregate Config API, сохраняют остальные объекты
и защищают несохранённый ввод; конфликт ревизии требует явного обновления данных.
Правило, используемое профилем, удалить нельзя. «Версии» поддерживает поиск
и страницы внутри загруженных
последних 100 черновиков и 100 выпусков. «Системная основа» показывает фактически
зарегистрированные возможности и проверки из bootstrap.

Проверенный черновик без несохранённых правок можно выпустить. Перед отдельной
активацией доступен точный состав immutable release с поиском и переходами по
связям; более ранний выпуск можно выбрать для rollback. Сохранение, проверка
и создание выпуска сами по себе не переключают active pointer.

Чат читает каталог активных профилей через `GET /api/realize-ai/config/runtime`
с правом `canUseChat`. Блок ввода показывает профиль и выпуск следующего ответа,
поддерживает поиск и страницы; выбор переносится между панелью, страницей
и отдельным окном. Первый единственный профиль выбирается автоматически;
устаревший выбор требует повторного выбора и сохраняет текст сообщения.
Новый run получает закрытый immutable snapshot в существующем `turnContext`,
а публичный RunDTO — сводку выпуска, профиля и хешей. Исторические runs
и повтор того же подтверждённого запроса сохраняют исходную конфигурацию.

Control plane проверяет hashes и применяет профиль, прямые роли, правила,
навыки и шаблоны `agent_instructions` внутри текущей read-only policy.
Provider thread используется повторно только при совпадении конфигурации,
модели и серверной политики, если не подключены tools поиска страниц;
с ними каждый run создаёт новый thread. Новый thread получает до 32 КиБ сохранённых
реплик как недоверенные данные. Точные лимиты и правила шаблонов описаны
в [интеграции Codex](architecture/codex-integration.md#конфигурация-агента-для-чата).

Явно выбранный в чате workflow выполняется сегментами существующих AIRun.
Сервер проходит условия, возможности и проверки до одного read-only agent turn,
вопроса пользователю или finish. Следующий сегмент запускается кнопкой;
ответ на вопрос отправляется из обычного composer. Private JSON checkpoint
сохраняет исторический config snapshot, путь, inputs/outputs и общий лимит шагов.
Продолжение атомарно создаёт одного child run и защищено от повторного исполнения.
Выбор процесса и сырой JSON-черновик переносятся между панелью, страницей
и отдельным окном; неопределённый результат запроса удерживает прежний повтор
и блокирует перенос между окнами. Ещё queued шаг можно явно передать повторно
после загрузки диалога, сохранив его run ID без создания child.
Capability создаёт DataOperation dry-run, проверка сверяет его реальное состояние
и audit; применение данных и approvals остаются отдельными действиями.
Процесс не принимает вложения и выбор файлов проекта. Локальный CP остаётся
in-memory: завершённые checkpoints сохраняются в Payload, потерянный активный
provider turn останавливается с ошибкой. Контракт описан в
[workflow runtime](specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md#108-исполнение-workflow-сегментами).

Раздел «Запуски процессов» (`/admin/ai/runs`) показывает owned корни с
актуальными сегментами, поиском, историческими фильтрами, периодом и серверными
страницами. Карточка `/admin/ai/runs/:rootRunID` отображает цепочку до 64 сегментов,
типизированные результаты шагов, проблемы и актуальные DataOperation с действиями.
Источник — прежние AIRun; ограничения выборки истории чата не используются.
Ссылки на профиль и процесс открывают exact immutable release через
`/admin/ai/settings?release=...&kind=...&key=...`; ссылка на диалог использует
`/admin/ai?conversation=...`. Переход не сбрасывает черновик; незавершённые
запросы и изменения защищены существующими owners. Полные private checkpoints
и инструкции в DTO реестра не выдаются.

База знаний, отдельные per-artifact endpoints и evals ещё не реализованы.
Capability/check metadata не расширяют полномочия и сами по себе
не подтверждают выполнение проверок.
Payload Admin и Config API не редактируют системные `.ai/**`, `.codex/**`,
license/security policy или executable registry.

## Мастерская дизайна: инструкции и целевой runtime

В `.ai` добавлены роль Workshop Director, workflow Мастерской, шаблон брифа
и supporting check качества; Codex использует адаптер
`.codex/skills/design-workshop/SKILL.md`. Они переиспользуют существующий
reference-to-frontend процесс. Роль, workflow, check и skill доступны через
S1 resolver/read; `.ai/templates` исключён его текущей policy, поэтому нужные
поля брифа включены в workflow, а локальный шаблон необязателен.
Автоматической загрузки этих файлов в installation
AIConfigRelease или пользовательский ChatGPT-профиль пока нет.

[Спецификация Мастерской](specifications/design-workshop.md) описывает целевой
общий сервис для Admin, ChatGPT и IDE, версии, preview, темы и расширение
существующего редактора workflow. Runtime DesignProject/Revision, MCP writes,
дизайн-presets в клиентской БД и `/system/workshop` не реализованы.
В текущей системной навигации `workshop` остаётся скрытым пунктом.

## Правило синхронизации для AI-агентов

`.ai` содержит активные runtime-инструкции.
`.codex` — адаптер Codex.
`documentation/` — source of truth для product-архитектурного контекста. Изменения
в контракте обязательно валидировать через `documentation/**` gate из
`.ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md`.

Целевая продуктовая и архитектурная спецификация Realize доступна через
канонический entrypoint
`documentation/REALIZE_AI_COMMERCE_MASTER_SPEC_v1.0_RU.md`. Полный текст
версии 1.0 разложен в нормативном порядке чтения в
`documentation/specifications/realize-ai-commerce/v1.0/**`.

Фактический runbook реализации начинается с
`documentation/delivery/INDEX.md`. Текущие результаты и известные ограничения
зафиксированы в `documentation/reports/**`.

# Карта глобального применения шаблонов — TASK-20 / ONE-01

Название шаблона актуализировано 9 ноября 2026 года. Дата, результаты исходного
исследования, коды задач и пути evidence сохранены.

Дата: 19 октября 2026 года. Родитель: TASK-9, «Самодостаточные шаблоны и управление оформлением».
Срез исходников: `main`, `53e938d4a80d1d60b7d06d3ec73d70981854b3a8`.

## Область и ограничения

Аудит выполнен в режиме **только чтения продуктового кода**. Изменяются этот
отчёт, ссылки документации и состояние TASK-20. Данные назначения шаблонов,
права, миграции и приложение не изменяются. Это карта реализации по исходникам;
текущее назначение в БД и поведение установленной сборки проверяются в TASK-21.

Основания: [ADR-0018](../architecture/decisions/ADR-0018-self-contained-template-packages.md),
[System Admin](../architecture/system-admin-shell.md),
[менеджер расширений](../specifications/extension-management.md),
[Мастерская](../specifications/design-workshop.md),
[предыдущая передача реализации](2026-10-12-admin-template-refactoring-handoff.md).
Исторические runtime-проверки не считаются повторёнными этим аудитом.

Требование пользователя: одно активное назначение на всю область Admin и
независимое назначение на весь сайт. Роли и подключённые модули могут менять
состав экранов. Матрица ниже — покрытие аудита, **не список разрешённых экранов
шаблона**. Новый экран должен наследовать оформление по общему контракту.
Это требование к следующему этапу; текущая реализация ему полностью не отвечает.

Решение pre-edit gate: `not_contract_level`. Отчёт фиксирует факты и пробелы;
новый SDK, стратегия интеграции Payload и порядок приоритетов настроек здесь
не утверждаются. Их владельцы и связанные задачи указаны отдельно.

## Что уже реализовано и как проходит назначение

| Механизм                    | Текущий источник и путь                                                                                                                                                                  | Реальная граница                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Назначение оформления       | `payload-extension-manager`: target, точные template/palette versions, mode, settings; [SSR guard](../../src/components/admin/system-shell/requireSystemAdmin.service.ts) читает `admin` | Подключённые рабочие страницы System Admin; frontend reader отсутствует                       |
| Выбор оболочки              | Отдельное persisted состояние `native/template`; [dashboard](../../src/components/admin/system-shell/SystemAdminDashboard.view.tsx) и SSR guard                                          | Меняет входы `/admin` и `/system`, но не переводит все прямые ссылки на один renderer         |
| Доступность оболочек        | [policy config](../../src/components/admin/system-shell/adminShellAvailability.config.ts), [proxy](../../src/proxy.ts), SSR guard                                                        | Может закрывать native или template routes; доступ к данным по-прежнему проверяют host/модули |
| Пользовательский light/dark | Admin cookie, локальные состояния controllers; у сайта [ThemeProvider](../../src/providers/Theme/index.tsx) и `localStorage.payload-theme`                                               | Переключение цвета само по себе не означает смену шаблона, палитры или layout                 |

Серверный [каталог](../../src/plugins/extensionManager.config.ts) и клиентский
[реестр](../../src/components/admin/system-shell/systemAdminTemplates.registry.ts)
содержат единственную compiled definition `realize@0.1.0`.
[Manifest](../../packages/template-realize/realize-template.manifest.json) объявляет
Admin `workspace/auth/status`. [SDK](../../packages/template-contracts/src/templateManifest.schemas.ts)
предусматривает frontend `page`, однако текущий
[RealizeTemplate](../../packages/template-realize/src/RealizeTemplate.component.tsx)
отклоняет frontend target. Это существующий Realize, не готовый RealizeAI Control Panel.

Сохранённое назначение проверяется относительно каталога и hash;
[resolver](../../packages/payload-extension-manager/src/server/resolveStoredExtensionAssignment.service.ts)
возвращает bootstrap fallback с `requiresRecovery`, сохраняя исходный pointer.
Выбор оболочки имеет отдельный
[fallback](../../packages/payload-extension-manager/src/admin-shell/readAdminShellState.service.ts).
Эти механизмы уже есть; визуальная работоспособность recovery в этом срезе не проверялась.

Корневой [System Admin layout](<../../src/app/(system-admin)/layout.tsx>) создаёт
provider с source defaults, без чтения persisted assignment. Каждая рабочая
страница отдельно вызывает `requireSystemAdmin`, передаёт appearance во вложенный
[provider](../../src/components/admin/system-shell/SystemAdminTemplateProvider.component.tsx),
затем module host вызывает
[SystemAdminTemplateHost](../../src/components/admin/system-shell/SystemAdminTemplateHost.component.tsx).
Добавить страницу под `/system` недостаточно для автоматического наследования
сохранённого назначения. Навигация и права не определяются template manifest.

В guard cookie `${cookiePrefix}-theme` с `light/dark` имеет приоритет над mode
назначения. [Общий hook](../../src/components/admin/system-shell/useSystemAdminTheme.hook.ts)
обновляет локальное состояние и cookie, а
[Workshop host](../../src/components/admin/design-workshop/DesignWorkshopHost.component.tsx)
использует своё `useState(initialTheme)` без этой записи cookie.
[Appearance controller](../../src/components/admin/extensions/useExtensionManager.hook.ts)
предполагает применение при следующем открытии страницы. Общей подписки открытых
страниц и вкладок на смену назначения здесь нет.

## Полнота инвентаризации

| Активная route group | `page` | `layout` | `error/not-found/loading` | `route` |
| -------------------- | -----: | -------: | ------------------------: | ------: |
| `(system-admin)`     |     10 |        1 |                         2 |       0 |
| `(payload)`          |      2 |        1 |                         1 |       3 |
| `(app)`              |     15 |        3 |                         3 |       4 |
| `(reference)`        |      3 |        1 |                         0 |       0 |
| Всего                | **30** |    **6** |                     **6** |   **7** |

Это число файлов входа, а не число пользовательских экранов: Payload создаёт
экраны из schemas/views, CMS — из документов. Все 30 page-файлов перечислены ниже.
31 специальный файл в private-дереве `src/app/_realize/**` исключён из активных
маршрутов; статус дерева подтверждают
[структура проекта](../architecture/project-structure.md) и [tsconfig](../../tsconfig.json).
API, preview redirects, metadata и quarantined код не объявляются рабочими экранами.

### System Admin — 10 входов

Здесь «рабочее» означает SSR assignment → page provider → neutral host.
Во всех защищённых цепочках host проверяет пользователя и роль `admin`.
Выбор шаблона не даёт дополнительных прав.

| URL и источник                                                                                                                  | Владелец / представление     | Оформление и особенность                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| [`/system`](<../../src/app/(system-admin)/system/page.tsx>)                                                                     | System Admin dashboard       | Рабочее; при effective shell `native` вход перенаправляется в `/admin`                        |
| [`/system/task-manager`](<../../src/app/(system-admin)/system/task-manager/page.tsx>)                                           | Task Manager host            | Рабочее; shell и UI-kit context                                                               |
| [`/system/workshop`](<../../src/app/(system-admin)/system/workshop/page.tsx>)                                                   | Workshop projects            | Рабочее                                                                                       |
| [`/system/workshop/[projectId]`](<../../src/app/(system-admin)/system/workshop/[projectId]/page.tsx>)                           | Workshop editor              | Рабочее; собственное локальное состояние mode; содержимое capture отдельно                    |
| [`/system/appearance`](<../../src/app/(system-admin)/system/appearance/page.tsx>)                                               | Extension Manager            | Рабочее; управление доступно и при выключенном template shell                                 |
| [`/system/access`](<../../src/app/(system-admin)/system/access/page.tsx>)                                                       | Access Management            | Рабочее; browser-cookie guard, исключение из отключения template shell                        |
| [`/system/access/device`](<../../src/app/(system-admin)/system/access/device/page.tsx>)                                         | Device authorization         | Рабочее; browser-cookie guard, такое же исключение                                            |
| [`/system/task-manager/reference`](<../../src/app/(system-admin)/system/task-manager/reference/page.tsx>)                       | Task Manager reference       | Фиксированный reference preset; cookie mode либо dark; рабочее назначение не читается         |
| [`/system/appearance/preview/[planId]`](<../../src/app/(system-admin)/system/appearance/preview/[planId]/page.tsx>)             | Appearance candidate preview | Actor-bound plan, candidate assignment/settings/mode; не активное назначение и не cookie mode |
| [`/system/appearance/shell-preview/[planId]`](<../../src/app/(system-admin)/system/appearance/shell-preview/[planId]/page.tsx>) | Shell candidate preview      | `plan.templateBinding.assignment`; отдельный предпросмотр, без apply                          |

При выбранном native прямые рабочие `/system/*` продолжают использовать template,
если policy разрешает. При выбранном template прямые `/admin/*` остаются Payload,
если native разрешён. При выключенном native proxy перенаправляет `/admin/*`
в `/system`, оставляя перечисленные auth-исключения. Reference-режим guard
обходит чтение рабочего shell/appearance; это отдельная граница демонстрации.

### Native Payload — динамические экраны и два файловых входа

[`/admin/[[...segments]]`](<../../src/app/(payload)/admin/[[...segments]]/page.tsx>)
передаёт управление `RootPage`. Общий
[layout](<../../src/app/(payload)/layout.tsx>) подключает Payload `RootLayout`,
`@payloadcms/next/css` и [custom.scss](<../../src/app/(payload)/custom.scss>).
В [host config](../../src/payload.config.ts) переопределён dashboard, а не все
native views. Generated layout/page/importMap не являются владельцами будущей интеграции.

Второй вход,
[`/admin/task-manager/reference`](<../../src/app/(payload)/admin/task-manager/reference/page.tsx>),
перенаправляет к System Admin reference.

| Семейство                                                                                                          | Источник экранов / владелец                                                                                       | Текущее оформление и граница                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/admin`                                                                                                           | `SystemAdminDashboard`; при native также штатный DefaultDashboard                                                 | Redirect в `/system` при template; native candidate preview через `?adminShellPreview=…`            |
| `/admin/collections/:collection`                                                                                   | Collection schemas и Payload list views                                                                           | Native таблицы, фильтры, pagination, selection, bulk actions; assignment System Admin не потребляют |
| `/admin/collections/:collection/create`, `/:id`                                                                    | Payload document editor и custom fields                                                                           | Native формы, tabs, relationships, upload drawers; доступ зависит от collection ACL                 |
| `/:id/api`, `/:id/versions[/:versionID]`, `/trash[/:id[…]]`                                                        | Native document subviews                                                                                          | API, revisions/drafts/trash — только где schema и права это включают                                |
| `/admin/globals/header`, `/admin/globals/footer`, их `/api`                                                        | [Header](../../src/globals/Header.ts), [Footer](../../src/globals/Footer.ts) и Payload global editor              | Native; версии для этих globals не включены                                                         |
| `/admin/account`                                                                                                   | Native account view                                                                                               | Payload DefaultTemplate; отдельного template account renderer нет                                   |
| `/admin/login`, `/logout`, `/logout-inactivity`, `/forgot`, `/reset/:token`, `/create-first-user`, `/unauthorized` | Payload auth views и [host auth routes](../../src/components/admin/system-shell/adminShellAvailability.config.ts) | Native minimal shell; наличие `auth` layout в пакете Realize не подключает его к этим маршрутам     |

Паттерны document subviews сверены с установленным resolver Payload
`@payloadcms/next` (`views/Root/getRouteData.js`, `getDocumentViewInfo.js`).
Они не означают, что каждая коллекция имеет все операции. Например, drafts Pages
включены в [Pages schema](../../src/collections/Pages/index.ts).
В [Users](../../src/collections/Users/index.ts) verification отключена;
generic verify route CMS не объявляется рабочим экраном этой конфигурации.
`/admin/register` отсутствует, frontend `/create-account` — другая область.
Auth и ACL не менялись ради оформления.

Реестр [сгенерированных типов](../../src/payload-types.ts), сверенный с source
composition [Payload](../../src/payload.config.ts) и [plugins](../../src/plugins/index.ts),
содержит **71 collection slug**:

| Группа             | Число | Состав / source owner и ограничения                                                                                                                                                                                                                    |
| ------------------ | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Базовые            |     8 | `users`, `pages`, `categories`, `media`, `media-profiles`, `media-originals`, `media-processing-sets`, `media-variants`; `src/collections`                                                                                                             |
| Forms              |     2 | `forms`, `form-submissions`; form builder plugin                                                                                                                                                                                                       |
| Ecommerce          |     8 | `addresses`, `variants`, `variantTypes`, `variantOptions`, `products`, `carts`, `orders`, `transactions`; ecommerce plugin и overrides                                                                                                                 |
| Access             |     4 | `access-credentials`, `access-device-requests`, `access-rate-limits`, `access-refresh-history`; [factory](../../packages/payload-access-management/src/accessCollections.config.ts), hidden и запрет прямого CRUD                                      |
| Task Manager       |     6 | `realize-task-projects`, `realize-task-lists`, `realize-tasks`, `realize-task-events`, `realize-task-operations`, `realize-task-git-syncs`; [factory](../../packages/payload-task-manager/src/taskCollections.config.ts), hidden и запрет прямого CRUD |
| Extensions         |     2 | `realize-extension-manager-state`, `realize-extension-manager-receipts`; [factory](../../packages/payload-extension-manager/src/extensionManagerCollections.config.ts), hidden и запрет прямого CRUD                                                   |
| AI и Workshop      |    36 | [Factory](../../packages/payload-ai-plugin/src/collections/index.ts): conversations/messages, runs, usage/search, design versions/previews, config, approvals, executions, integrations/MCP и другие service collections; hidden и собственные ACL     |
| Внутренние Payload |     5 | `payload-kv`, `payload-jobs`, `payload-locked-documents`, `payload-preferences`, `payload-migrations`                                                                                                                                                  |

Регистрация schema не доказывает доступность её native UI. Hidden скрывает
навигацию, ACL определяет прямой доступ, а `REALIZE_AI_COMPILE_TIME_OMIT` может
исключить AI из конкретной сборки. Проверка текущих runtime flags и реальных ролей
остаётся TASK-21. Global inheritance нельзя строить на этом перечне slugs.

### AI / MCP / Usage — 14 зарегистрированных views

Источник путей: [plugin registration](../../packages/payload-ai-plugin/src/realizeAIPlugin.plugin.ts),
[defaults](../../packages/payload-ai-plugin/src/constants.ts) и host plugin config.
Все views находятся под Payload root; module permissions определяют доступность.

| Пути                                                   | Владелец представления                                                        | Источник оформления                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/admin/ai`, `/admin/ai/window`                        | [RealizeAIView](../../packages/payload-ai-plugin/src/admin/RealizeAIView.tsx) | DefaultTemplate; window обходит DefaultTemplate, но сохраняет Payload root/providers |
| `/admin/ai/settings`                                   | Agent layer settings                                                          | Payload + собственные module components                                              |
| `/admin/ai/runs`, `/admin/ai/runs/:rootRunID`          | Workflow runs list/detail                                                     | Payload + module components                                                          |
| `/admin/ai/search`                                     | Search observations                                                           | Payload + module components                                                          |
| `/admin/ai/usage`, `/admin/ai/usage/platform`          | Legacy aliases Usage                                                          | Тот же Usage renderer                                                                |
| `/admin/analytics/ai`, `/admin/analytics/ai/platform`  | Usage installation/platform                                                   | Payload + module components                                                          |
| `/admin/integrations`, `/admin/integrations/:provider` | Integration catalog/settings                                                  | Payload + module components                                                          |
| `/admin/mcp-servers`, `/admin/mcp-servers/:serverID`   | MCP list/detail                                                               | Payload + module components                                                          |

[AdminUiTheme](../../packages/payload-ai-plugin/src/admin/AdminUiTheme.component.tsx)
переносит только Payload mode в UI-kit. Активные template/palette/settings System
Admin сюда не передаются. Глобальный AI provider также относится к Payload root,
а не объединяет два Admin shell.

### Медиатека и поля редакторов

[Media schema](../../src/collections/Media.ts) заменяет list view и добавляет
`/admin/collections/media/reference`. Рабочий
[MediaListView](../../src/components/admin/media/MediaListView.component.tsx)
использует native `DefaultListView`; в drawer остаётся native table.
[MediaLibraryGrid](../../src/components/admin/media/MediaLibraryGrid.component.tsx)
получает Payload mode через `UiTheme`, без рабочего template assignment.
[MediaProcessingField](../../src/components/admin/media/MediaProcessingField.component.tsx)
и связанные pickers имеют такую же отдельную тематизацию.
[MediaReferenceView](../../src/components/admin/media/MediaReferenceView.view.tsx)
сохраняет `DefaultTemplate`, а
[reference host](../../src/components/admin/media/MediaReferenceHost.component.tsx)
читает Payload mode. Владелец интеграции — host media UI совместно с native editor
adapter; это не автоматически покрытая страница System Admin.

### Сайт — 15 входов

Общий [layout](<../../src/app/(app)/layout.tsx>) напрямую собирает
`Providers → AdminBar/LivePreviewListener → Header/main/Footer`.
[Providers](../../src/providers/index.tsx) подключают Auth, Theme, HeaderTheme,
Sonner и Ecommerce. Источник стилей — [globals.css](<../../src/app/(app)/globals.css>),
`src/components/ui` и feature components. `HeaderTheme` задаёт локальное
оформление header, не выбирает шаблон. Во всех строках ниже frontend assignment
**не подключён**. [Store](../../packages/payload-extension-manager/src/appearance/createExtensionAppearanceStore.util.ts)
умеет хранить `targets.frontend`, но storefront его не читает.

| URL и page source                                                                  | Владелец содержимого / дополнительный layout                                                    | Состояния и динамические границы                                                             |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`/`](<../../src/app/(app)/page.tsx>)                                              | Переиспользует CMS page                                                                         | Slug `home`                                                                                  |
| [`/[slug]`](<../../src/app/(app)/[slug]/page.tsx>)                                 | PageContent → RenderHero/RenderBlocks                                                           | Произвольные CMS документы; published/draft preview; `notFound`                              |
| [`/shop`](<../../src/app/(app)/shop/page.tsx>)                                     | Shop [layout](<../../src/app/(app)/shop/layout.tsx>), Search/Categories/FilterList, Grid        | `q`, `sort`, `category`, empty results                                                       |
| [`/products/[slug]`](<../../src/app/(app)/products/[slug]/page.tsx>)               | Gallery, ProductDescription, RenderBlocks, RelatedProducts                                      | Product documents, preview, `notFound`                                                       |
| [`/account`](<../../src/app/(app)/(account)/account/page.tsx>)                     | Account [layout](<../../src/app/(app)/(account)/layout.tsx>), AccountNav, AccountForm/OrderItem | Гость → login                                                                                |
| [`/account/addresses`](<../../src/app/(app)/(account)/account/addresses/page.tsx>) | Account layout, AddressListing/CreateAddressModal                                               | Гость → login; dialog                                                                        |
| [`/orders`](<../../src/app/(app)/(account)/orders/page.tsx>)                       | Account layout, OrderItem                                                                       | Гость → login; empty state                                                                   |
| [`/orders/[id]`](<../../src/app/(app)/(account)/orders/[id]/page.tsx>)             | Account layout, OrderStatus/ProductItem/AddressItem                                             | Владелец или гостевой доступ по email/token; отказ → `notFound`; layout сам не требует login |
| [`/checkout`](<../../src/app/(app)/checkout/page.tsx>)                             | CheckoutPage, Stripe Elements                                                                   | Empty/processing/payment/error; без Stripe key конфигурационное сообщение                    |
| [`/checkout/confirm-order`](<../../src/app/(app)/checkout/confirm-order/page.tsx>) | ConfirmOrder                                                                                    | Переход в order с гостевыми параметрами либо `/`                                             |
| [`/find-order`](<../../src/app/(app)/find-order/page.tsx>)                         | FindOrderForm                                                                                   | Публичная форма поиска заказа                                                                |
| [`/login`](<../../src/app/(app)/login/page.tsx>)                                   | LoginForm                                                                                       | Авторизованный → account; после входа redirect либо account                                  |
| [`/create-account`](<../../src/app/(app)/create-account/page.tsx>)                 | CreateAccountForm                                                                               | Frontend registration; отдельна от Admin auth                                                |
| [`/forgot-password`](<../../src/app/(app)/forgot-password/page.tsx>)               | ForgotPasswordForm                                                                              | Публичное восстановление                                                                     |
| [`/logout`](<../../src/app/(app)/logout/page.tsx>)                                 | LogoutPage                                                                                      | Клиентский logout, затем ссылки; автоматического redirect нет                                |

[Pages](../../src/collections/Pages/index.ts) допускает hero и восемь layout blocks:
CTA, Content, Media, Archive, Carousel, ThreeItemGrid, Banner, Form.
[PageContent](../../src/components/PageContent.component.tsx) использует общие
[RenderHero](../../src/heros/RenderHero.tsx) и [RenderBlocks](../../src/blocks/RenderBlocks.tsx).
[Products](../../src/collections/Products/index.ts) имеет CTA/Content/Media layout.
Оформление должно наследоваться для новых CMS slugs и блоков без регистрации каждого URL.

Корзина находится в Header → [CartModal](../../src/components/Cart/CartModal.tsx)
→ Radix Sheet portal; отдельного `/cart` page нет. Поиск ведёт в `/shop?q=…`,
отдельного `/search` page нет. Встречающиеся ссылки `/search` не доказывают наличие
поискового экрана: они попадут в CMS `[slug]`; содержимое БД здесь не проверялось.

[CheckoutPage](../../src/components/checkout/CheckoutPage.tsx) передаёт Stripe
собственную appearance configuration с фиксированными значениями и частичным
чтением mode. [Sonner](../../src/providers/Sonner.tsx) читает только light/dark.
Эти внешние поверхности требуют адаптера токенов со стороны frontend owner;
одного контекста вокруг layout недостаточно.

### Публичные референсы — ещё три входа

[Reference layout](<../../src/app/(reference)/layout.tsx>) задаёт фиксированный
provider и не читает рабочее назначение.

| URL и источник                                                                                             | Владелец / намеренное исключение                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`/reference/task-manager`](<../../src/app/(reference)/reference/task-manager/page.tsx>)                   | Фиксированный Task Manager workbench; локальный light по умолчанию |
| [`/reference/alien-gummies`](<../../src/app/(reference)/reference/alien-gummies/page.tsx>)                 | Собственная reference composition и CSS Modules                    |
| [`/reference/alien-gummies/product`](<../../src/app/(reference)/reference/alien-gummies/product/page.tsx>) | Собственная product composition и CSS Modules                      |

Защищённый и публичный Task Manager reference используют
[TaskManagerWorkbench](../../src/components/admin/task-manager/reference/TaskManagerWorkbench.component.tsx),
который прямо импортирует `SystemAdminShell` из `template-realize/ui`.
Замена зарегистрированного renderer не заменяет этот конкретный shell.
[Reference preset](../../src/components/admin/system-shell/systemAdminReferenceAppearance.config.ts)
нужен как стабильный образец; его неизменность не является багом рабочего apply.

### Ошибки, portals, preview и технические входы

| Поверхность                         | Источник и текущее поведение                                                                                                                                                                                                                                             | Владелец границы                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| System appearance preview error/404 | [error](<../../src/app/(system-admin)/system/appearance/preview/[planId]/error.tsx>), [not-found](<../../src/app/(system-admin)/system/appearance/preview/[planId]/not-found.tsx>): template status с фиксированным light и provider предка                              | Route status owner; page provider не покрывает собственный error boundary                                          |
| Другие System Admin ошибки          | Общего `system/error`, `system/not-found`, `global-error` в активном дереве нет; invalid preview plan имеет собственный fallback                                                                                                                                         | Нет подтверждённого общего покрытия ошибок активным assignment                                                     |
| Payload 404                         | [not-found](<../../src/app/(payload)/admin/[[...segments]]/not-found.tsx>) → native NotFoundPage                                                                                                                                                                         | Payload host                                                                                                       |
| Frontend error/404/loading          | [error](<../../src/app/(app)/error.tsx>), [not-found](<../../src/app/(app)/not-found.tsx>), [shop/loading](<../../src/app/(app)/shop/loading.tsx>): Tailwind/local classes и storefront UI                                                                               | Frontend boundary owners; отдельные фиксированные цвета                                                            |
| UI-kit primitives                   | [Button](../../packages/ui-kit/src/button/UiButton.component.tsx), [Input](../../packages/ui-kit/src/input/UiInput.component.tsx) используют runtime adapters, без контекста — base primitives                                                                           | Сейчас сменными slots покрыты Button/Input, не весь набор UI                                                       |
| UI-kit DOM theme                    | [UiTheme](../../packages/ui-kit/src/theme/UiTheme.component.tsx) применяет palette/settings локально; mode передаётся отдельно                                                                                                                                           | Не выбирает шаблон; caller styles могут перекрывать runtime styles                                                 |
| Dialog и mobile shell portals       | [UiDialogContent](../../packages/ui-kit/src/dialog/UiDialogContent.component.tsx), [SystemAdminShell](../../packages/template-realize/src/layouts/admin/SystemAdminShell.component.tsx) повторяют UiTheme внутри portal                                                  | React context сохраняется, CSS inheritance требует DOM wrapper; произвольный новый portal автоматически не доказан |
| Storefront overlays                 | Cart Sheet, dialogs адресов, selects из `src/components/ui`                                                                                                                                                                                                              | Storefront global styles и HTML `data-theme`; не System Admin context                                              |
| Workshop preview content            | [WorkshopPreview](../../packages/payload-ai-plugin/src/admin/design-workshop/WorkshopPreview.component.tsx), [WorkshopPreviewImage](../../packages/payload-ai-plugin/src/admin/design-workshop/WorkshopPreviewImage.component.tsx) показывают авторизованный PNG capture | Это изображение сохранённого React/CSS макета, не live iframe и не смена рабочего Admin template                   |
| Capture runtime                     | [Runner](../../services/ai-execution-worker/src/design-workshop/designPreviewCapture.runner.mjs) собирает отдельный документ со стилями ревизии                                                                                                                          | Владелец — execution worker; UI управления preview остаётся в host                                                 |
| CMS draft preview                   | [preview handler](<../../src/app/(app)/next/preview/route.ts>), [exit-preview](<../../src/app/(app)/next/exit-preview/route.ts>)                                                                                                                                         | Авторизованный draft mode и redirect на обычный frontend renderer                                                  |
| Health                              | [live](<../../src/app/(app)/api/health/live/route.ts>), [ready](<../../src/app/(app)/api/health/ready/route.ts>)                                                                                                                                                         | API endpoints, не страницы оформления                                                                              |
| Payload API                         | [REST](<../../src/app/(payload)/api/[...slug]/route.ts>), [GraphQL](<../../src/app/(payload)/api/graphql/route.ts>), [playground](<../../src/app/(payload)/api/graphql-playground/route.ts>)                                                                             | SDK handlers; playground — отдельный технический UI, не template host                                              |

## Выводы и владельцы пробелов

| №   | Подтверждённый пробел / evidence выше                                                               | Влияние                                                                     | Владелец и связанная задача                                                |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| F1  | Persisted assignment подключается отдельными System Admin pages; root provider использует defaults  | Новая страница может обойти глобальное назначение                           | Host + template-contracts; TASK-25, TASK-34                                |
| F2  | Shell choice изменяет входы, direct native и template routes могут сосуществовать                   | Переключение Payload ↔ Realize не означает глобальную замену всех экранов   | Host routing + native adapter; TASK-44, TASK-45                            |
| F3  | Native auth/editor/collection/global views остаются Payload                                         | Значительная часть Admin и вход в него не покрыты рабочим шаблоном          | Host auth/native adapter; TASK-39, TASK-40, TASK-44, TASK-45               |
| F4  | AI/MCP/Usage и медиатека передают mode, не assignment/palette/settings                              | Сходный light/dark скрывает разные источники оформления                     | AI plugin UI — TASK-46; media/editor host — TASK-45                        |
| F5  | Frontend layout не читает assignment; concrete frontend renderer отсутствует                        | Сайт, CMS slugs, магазин и account не переключаются через менеджер шаблонов | Frontend host + template package; TASK-47, TASK-48                         |
| F6  | Mode имеет разные источники и приоритеты; controllers не подписаны на общий apply                   | Нельзя обещать одинаковое состояние открытых экранов/вкладок                | Appearance contract и host controllers; TASK-25, TASK-34, TASK-42, TASK-43 |
| F7  | Button/Input — ограниченный набор adapters; portals и Stripe/Sonner имеют отдельную доставку стилей | Замены shell недостаточно для всех элементов/оверлеев                       | UI-kit/template/frontend adapters; TASK-32, TASK-33, TASK-48               |
| F8  | Error/404/loading покрыты разными владельцами; preview error фиксирует light                        | Ошибочные состояния могут отличаться от активного оформления                | Route status/recovery host; TASK-49                                        |

Фиксированные references, immutable candidate preview и Workshop PNG отмечены
как **намеренные отдельные источники**, а не автоматически как дефекты. Для
приёмки рабочего переключения их нужно отличать от экранов текущего назначения.
Временные и отложенные решения не превращены в архитектурный контракт.

## Отложенные решения

Способ единой интеграции native Payload, общий host-контракт для новых модулей,
приоритет пользовательского mode и глобальных настроек, перенос drafts при live
switch, полный набор primitives и правила external widget adapters относятся к
последующим задачам. Аудит не выбирает реализацию за их владельцев и не меняет
настройки auth/registration. Обновление стека и создание AI workflow/skills также
не входят в ONE-01.

## Проверки и материалы

Выполнена статическая сверка всех активных route entry files, source config,
registries, guards, module views, CMS schemas, template manifest, UI contexts и
основных цепочек стилей. Подробности динамического native routing уточнены по
установленному Payload resolver. Все findings имеют source evidence и owner.

Локальные журналы связанной удалённой задачи:
`.ai-workspace/tasks/2026-10-19-realize-one-01-task9/logs/`:
`route-inventory.json`, `product-before.json`, `product-after.json`,
`verification.json`, `git-inspect-before.json`, `git-inspect-after.json`.
Проверка включает полноту ссылок матрицы, наличие локальных link targets,
неизменность 2477 продуктовых файлов и состав изменений через Git inspect worker.
Окончательный результат проверок хранится в `verification.json` и TASK-20.
Локальная задача-дубль не создавалась; каталог используется только для evidence.

Browser/runtime, screenshots, фактические DB assignments, compile-time flags
установленной сборки и матрица реальных прав в этом шаге не проверялись. Build,
unit tests и deployment не запускались: продуктовый код не меняется. Наличие
исходника или historical test не является доказательством текущего UI поведения.

Форма отчёта основана на
[шаблоне frontend-аудита](../../.ai/templates/agent-reports/TEMPLATE-FRONTEND-GUARDRAIL-AUDIT.md)
с русской структурой «область → наблюдения → проверки».
Применены [frontend audit skill](../../.codex/skills/frontend-guardrail-audit/SKILL.md),
[documentation sync](../../.codex/skills/skill-documentation-sync/SKILL.md),
[Git skill](../../.codex/skills/git-commit-push/SKILL.md),
[правило материалов](../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md),
[каноническая документация](../../.ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md),
[React boundaries](../../.ai/rules/development/frontend/RULE-NEXT-REACT-FRONTEND-BOUNDARIES.md),
[local visual contracts](../../.ai/rules/development/frontend/RULE-NO-LOCAL-VISUAL-CONTRACT.md),
[related UI drift](../../.ai/rules/development/frontend/RULE-NO-RELATED-UI-DRIFT.md).
Применимые checks и итог самопроверки сохранены в `verification.json`;
[критерии отчёта](../../.ai/checks/self-review/CHECK-FRONTEND-GUARDRAIL-AUDIT-REPORT.md)
проверяются без изменения продукта.

## Единственный следующий шаг

**TASK-21 / ONE-02:** проверить текущее переключение в авторизованном браузере
по этой матрице, зафиксировав выбранный вариант, переходы, новые и уже открытые
страницы, mode и recovery. Runtime-проверка должна подтвердить либо уточнить
статические выводы; исправления и новый шаблон в неё автоматически не входят.

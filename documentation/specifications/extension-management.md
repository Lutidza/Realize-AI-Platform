# Менеджер расширений Payload — контракт и этапы реализации

Версия: **0.6**, 2026-10-12. Статус: **установленные шаблоны, appearance lifecycle и переключение Payload ↔ Realize доставлены в основную локальную установку; общий installer нового кода остаётся целевым**.
Целевой менеджер устанавливает и управляет совместимыми расширениями из Admin.
Шаблонные пакеты следуют [единому контракту Мастерской](design-workshop.md#111-единый-контракт-самодостаточного-шаблона)
и [ADR-0018](../architecture/decisions/ADR-0018-self-contained-template-packages.md).
[Task Manager](task-management.md) остаётся отдельным семейством расширений.
Полный installer по этому ТЗ ещё не реализован. После Template SDK, Realize
package и host реализован ограниченный срез каталога и appearance lifecycle.
После source и PostgreSQL проверок он установлен в существующую локальную службу;
session/API, настройки и переключение оболочки проверены в рабочем браузере.
Разделы 1–11 задают целевой общий installer; наличие его
требования или критерия приёмки не означает реализованную возможность.

## Текущий этап реализации

### Раздел установленных шаблонов

Для EM-02 реализован ограниченный read-only inventory в «Темы и шаблоны → Установленные
шаблоны» на `/system/appearance#appearance-installed`. Он показывает встроенный
Payload и пакетные шаблоны текущего процесса. Native остаётся host-вариантом без
фиктивного manifest, package или palette. Существующий `#appearance-catalog`
сохраняется как переход к этому разделу; источник compiled каталога по-прежнему
используется для проверки настроек и совместимости.

Источник фактической поставки — проверенный receipt/BUILD_ID работающего bundle
и trusted compiled registry того же процесса. `manifestHash` не объявляется
digest поставленного пакета, а наличие source/npm metadata не означает установку.
Без подтверждённого runtime UI явно показывает неподтверждённое состояние.
Bundled default не получает вымышленный receipt от ещё отсутствующего installer.
Отдельная изменяемая таблица со списком «установленных» не создаётся.

`GET /api/realize-extensions/installed-templates` использует существующие session/ACL
и private/no-store envelope. DTO содержит runtime identity, точные версии, тип
builtin/package, Admin/frontend targets, совместимость/доступность, независимо
сохранённый выбор, effective активность и defaults, доступные палитры и действия.
Недоступные сохранённые версии показываются отдельно и не выдаются за установленный
код. Native версия следует реально установленному Payload. Package настройки
ведут к существующему editor; выбор — к prepare/preview/apply. Переход из карточки
не сбрасывает dirty draft или frozen UUID. Установка/обновление/удаление нового
кода остаются недоступными до delivery adapter.

В основную БД адресно применена только `20261012_094626_extension_manager_state`
(M32); прежние 29 migration receipts сохранены. Две несвязанные pending migrations
не применены. Существующий `realize-web.service` использует проверенную сборку
`_HmknEVf1nCPefAPVruPV`: inventory подтверждает Payload Admin `3.88.0` и
`@realize/template-realize@0.1.0`. Версия native читается публичным
`getDependencies`; standalone содержит необходимые metadata и физический entry
Payload, которые нужны этому API для разрешения пакета.

Live приёмка проверила native вход Admin, отказ anonymous/customer, карточки и
сохранность drafts, 1440/390 light/dark, appearance preview без применения,
настоящий native preview/dashboard, apply → recover и immutable UUID replay.
Временные пользователи удалены; ошибки console/page отсутствуют. Итог и
расположение сохранённых delivery/browser evidence описаны в
[отчёте передачи](../reports/2026-10-12-admin-template-refactoring-handoff.md).
19 октября локальное досье перенесено в Task Manager как `TASK-9`, список
«локальные задачи» проекта «Рабочий стол»; архивный путь указан в описании задачи.
`sourceVersion` в receipt идентифицирует существующий ограниченный набор search
sources; он не является digest всего приложения или template package.

Inventory читает appearance и shell в отдельных read-only транзакциях: при
конкурентном apply статус может кратковременно отражать разные моменты наблюдения.
Refresh после операции обновляет view; mutation CAS и immutable ledger сохраняют
свои транзакционные гарантии. Пользователь разрешил доставку после согласованного
плана. Backup, новые службы/порты, Git и изменение агентских инструкций не выполнялись.

Владелец — самостоятельный `packages/payload-extension-manager`
(`@realize/payload-extension-manager`), без зависимости от AI control plane.
Он содержит browser-safe `/contracts`, server facade `/server`, каталог
совместимого compiled кода, immutable планы, state/replay persistence и Payload
plugin/endpoints. Host задаёт registry, scope, identity и callbacks прав;
[`src/plugins/extensionManager.config.ts`](../../src/plugins/extensionManager.config.ts)
компонует Realize. Пакет не импортирует внутренности host или AI packages.
Интерфейс `/system/appearance` принадлежит
`src/components/admin/extensions/` и подключается к независимому System Admin host.

Первый срез: prepare → preview → apply/recover назначения уже включённого
template package. Admin/frontend имеют независимые revisions. План связан с
actor, исходной revision, catalog hash и нормализованными settings; apply
использует CAS и UUID replay receipt в одной транзакции. Preview не меняет
назначение. Новое назначение читается при открытии страницы; текущие controller
snapshots не заменяются из другой вкладки во время редактирования.

Встроенный Realize отмечается «включён в текущую сборку». Наличие его source,
manifest или архива не выдаётся за установку через кнопку. Для нового кода нужны
trusted extension recipe в существующем executor, delivery bridge и actual
runtime observer. Сейчас такого adapter нет: install/update/replace кода
отклоняется до создания очереди, с причиной отсутствующей готовности. Общая
appearance операция не запускает npm, Git, миграции или deployment. Snapshot
возвращает `codeInstallation.ready: false` и
`reason: "DELIVERY_ADAPTER_UNAVAILABLE"`; ошибочный install не создаёт job.

Первый frontend renderer отсутствует: отдельная вкладка объясняет отсутствие
совместимого пакета, а сервер отклоняет неподдержанное назначение. Workshop
starter/producer, выпуск DesignPackage в этот каталог и delivery integration
остаются целевыми. Полная приёмка installer по AC-EM-02/06/14/17 не выполнена.

### Выбор штатной и пакетной оболочки Admin

Первый пользовательский выбор включает штатный Payload Admin и Realize. Native
является встроенным вариантом host, а не вторым собственным template package.
Он следует установленной версии CMS; его установка/обновление не имитируется
отдельной кнопкой template installer. Realize и будущие собственные шаблоны
имеют независимые версии и общий package lifecycle. Создание второго пакета
не является условием переключения Payload ↔ Realize.

Host policy задаёт доступность native UI для конкретной установки, основной вход
и разрешённый возврат. Интерфейс настроек должен показывать доступные оболочки,
отдельно — template/palette/mode/settings пакетной оболочки. Native отключается
как пользовательский UI без отключения backend/API; текущие зависимости от его
login/unauthorized требуют отдельного решения до закрытия этих страниц.

Appearance DTO/API и store описывают custom package assignment; native не является
значением `TemplateSelection`. Отдельный lifecycle выбора оболочки, routing
adapter и UI реализованы третьим этапом. Существующие appearance assignments,
планы и immutable receipts не переписываются. Дополнительная SQL migration для
shell domain не нужна: он использует те же две таблицы с собственным scope/codec. Подробная граница —
[System Admin](../architecture/system-admin-shell.md#штатный-и-пакетный-интерфейсы-admin).

#### Контракт первого переключателя оболочек

Выбор хранится отдельно: `AdminShellMode = "native" | "template"` в scope
`${scopeKey}:admin-shell`. Store `schemaVersion: "1.0", domain: "admin-shell"`
имеет собственные revision/current/previous, plans и immutable receipts. Оба
domain используют существующие private state/receipt collections со строгими
codec; прежний appearance JSON и его ledger сохраняются без переписывания.
Выбор native сохраняет custom assignment, palette и settings.

Host задаёт доступность обоих вариантов, default/fallback, доверенную установленную
версию Payload и маршруты. Нельзя отключить оба варианта. Prepare select/recover
связан с actor, UUID, policy hash и исходной revision. Template plan дополнительно
фиксирует exact admin assignment, appearance revision/state hash и catalog hash.
Apply проверяет зависимости внутри одной транзакции под упорядоченными locks
shell/appearance scopes. Native plan не зависит от исправности custom assignment.
Для recovery действуют те же preview/CAS/replay ограничения; восстановления
оболочки и оформления являются отдельными операциями.

API с той же авторизацией и HTTP envelope: `GET /admin-shell`,
`POST /admin-shell/plans`, `GET /admin-shell/plans/:id`,
`POST /admin-shell/apply` относительно manager prefix. Snapshot возвращает
policy/hash, state, storage, history и permission управления оболочкой.
Prepare принимает `action: "select", mode, expectedRevision, expectedPolicyHash`
либо `action: "recover", expectedRevision, expectedPolicyHash`; apply —
`planId, expectedPlanHash`. Private actor/replay metadata не выходит в DTO.

Основной `/admin` после проверки Payload session открывает штатный dashboard
либо переводит на самостоятельный `/system`; Realize не вкладывается в native
layout. Native preview на `/admin?adminShellPreview=<planId>` проходит проверку
actor/TTL/CAS/policy и показывает настоящий dashboard. Пакетный preview на
`/system/appearance/shell-preview/<planId>` использует exact candidate.
Открытые формы после применения остаются на месте; переход выполняется явно.
Shell/appearance команды используют общий imperative lock и frozen UUID/payload
при неподтверждённом ответе. Изменение policy во время ожидания транзакции
проверяется повторным чтением внутри callback; exact replay возвращает прежний
результат без чтения appearance dependency.
Отключение native UI через host policy сохраняет auth-маршруты как текущую
зависимость и Payload API. Неперенесённые native редакторы не становятся
Realize страницами автоматически.

Defaults этой установки: native и template доступны, основной вариант — template
Realize, fallback — native. `REALIZE_NATIVE_ADMIN_ENABLED` и
`REALIZE_TEMPLATE_ADMIN_ENABLED` принимают только `true`/`false`;
`REALIZE_DEFAULT_ADMIN_SHELL` — `native`/`template`. Выключение обоих либо выбор
выключенного default отклоняет bootstrap. Policy задаётся конфигурацией установки,
а сохранённый выбор — экраном Admin; смена defaults не переписывает сохранённый
выбор. Версия native читается публичным `getDependencies` Payload из installed
package metadata, без отдельной версии шаблона. Next Proxy исключает выключенные
native рабочие страницы до RootLayout и сохраняет явно настроенные auth paths.

Текущий срез установлен в существующую службу после M32-only применения и принят
по отдельным live checks, перечисленным выше. Appearance/shell API не выполняют
миграции, Git или deployment; работа из Admin с уже включённым кодом не означает
готовность installer нового кода. Backup пользователь явно исключил.

### API текущего среза

При стандартном `apiRoute` endpoints имеют базу `/api/realize-extensions`;
Payload-host может настроить префикс. Ответ — `{ ok: true, data }` либо безопасный
`{ ok: false, error: { code, message } }`, с `private, no-store`.

| Метод и путь                                       | Результат и ограничения                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/realize-extensions`                      | Каталог, независимые `targets.admin/frontend`, последние 32 apply receipts, permissions и готовность storage/delivery.                                               |
| `GET /api/realize-extensions/installed-templates` | Read-only inventory: runtime proof, builtin/package, версии, targets, availability, selected/active/default, settings/select actions; те же session/ACL и private/no-store. |
| `POST /api/realize-extensions/appearance/plans`    | Строгий `assign` или `recover`: `target`, `expectedRevision`, `expectedCatalogHash`; для assign также exact `selection` и `settings`. Возвращает immutable plan DTO. |
| `GET /api/realize-extensions/appearance/plans/:id` | Проверяет actor, TTL, catalog и исходный target state; возвращает preview DTO без изменения назначения.                                                              |
| `POST /api/realize-extensions/appearance/apply`    | `{ planId, expectedPlanHash }`; атомарно применяет точный план и возвращает receipt DTO. Recover проходит тот же prepare/preview/apply путь.                         |
| `POST /api/realize-extensions/install`             | После ACL/input проверки возвращает `DELIVERY_ADAPTER_UNAVAILABLE`; код и очередь не меняются.                                                                       |

Prepare/apply требуют `Idempotency-Key` — canonical lowercase UUID. Один UUID
разрешён в разных kind namespaces `prepare`/`apply`. Actor и scope определяет
сервер; JSON не задаёт пользователя, установку, пути, registry или runtime build.
POST принимает JSON до 32 КиБ, проверяет browser Origin по host/CSRF allowlist;
лишние query и неподдержанные поля отклоняются. Public DTO не содержит raw Payload
документов, actor/request replay metadata или SQL/provider exceptions.

Все операции проверяют действующую session и host ACL. В Realize admin читает
каталог и меняет appearance; установка кода имеет отдельный platform-owner ACL.
Permissions не заменяют проверку сервером. Общий collection CRUD закрыт.

### State, immutable ledger и атомарность

Schema owner —
[`extensionManagerCollections.config.ts`](../../packages/payload-extension-manager/src/extensionManagerCollections.config.ts).
Две hidden collections имеют `lockDocuments: false` и запрещённый native CRUD:

| Collection / таблица                                                        | Данные и инварианты                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `realize-extension-manager-state` / `realize_extension_manager_state`       | Unique `scopeKey`, JSON store `schemaVersion: "1.0"`, независимые `revision/current/previous` для Admin/frontend и pending plans. В persisted JSON `receipts: []`.                  |
| `realize-extension-manager-receipts` / `realize_extension_manager_receipts` | Unique SHA-256 `replayKey` от scope/actor/kind/requestId, indexed scope/kind и immutable private receipt JSON. UPDATE/DELETE запрещены hooks даже при overrideAccess и SQL trigger. |

[`ExtensionAppearanceRepository`](../../packages/payload-extension-manager/src/persistence/ExtensionAppearance.repository.ts)
имеет `read(scopeKey)` и
`mutate(req, scopeKey, bootstrapStore, callback, replay)`. Read различает пустой
готовый store и отсутствующую таблицу. Mutate получает только matching receipt
из ledger и проверенный state; callback вызывает чистую prepare/apply операцию.
Новая state запись и receipt сохраняются одной независимой Payload/PostgreSQL
транзакцией. Scope advisory lock берётся до первого read/upsert; unique indexes
дополнительно защищают concurrent first request. Read под тем же lock согласует
state/history. Внешняя caller transaction отклоняется; lock/statement timeouts
ограничены 3/8 секундами. Failure откатывает обе записи.

План hash связан с actor, request identity, target, revision/state hash,
catalog hash, exact назначением и нормализованными settings. Catalog hash
покрывает host compatibility, manifest/settings schema и доступную runtime build
identity. Assignment хранит `manifestHash` метаданных; он не является digest
поставленного release artifact. Apply повторно проверяет исходное состояние,
каталог, TTL, hash, actor и доступность назначения; конкурирующая revision
возвращает конфликт без изменения pointer.

Pending plans ограничены 50, TTL по умолчанию 15 минут, максимум 30 минут.
Expired plans удаляются при следующем prepare, применённый plan — при apply.
Лимит pure store в 256 receipts ограничивает загруженное представление, а не
историю операций: mutation загружает 0/1 matching receipt, UI — до 32 apply
records. Lifetime ledger не очищается. Поэтому старый apply UUID возвращает
исходный receipt даже после удаления plan/TTL; повтор prepare после истечения
плана возвращает `PLAN_EXPIRED`. Изменённая команда с прежним UUID возвращает
`REPLAY_CONFLICT`, а actor/scope другого запроса не получает чужой replay.

### Экран, SSR и границы поставки

`/system/appearance` показывает compiled каталог, настройки target, подготовленный
план, результат и историю. Общая боковая панель ведёт к этим разделам через
same-page anchors; она не перезагружает открытый draft.
`/system/appearance/preview/[planId]` читает защищённый
Admin plan и рендерит его exact definition/palette/settings через тот же host;
рабочий pointer остаётся прежним. Browser command controller замораживает
UUID/payload после unknown outcome и повторяет прежний запрос; новую команду
блокирует до подтверждённого результата. Pending identity хранится только в
открытом экране, а серверный ledger переживает restart.

Рабочие routes после session/ACL читают persisted appearance на сервере.
Если отсутствует одна из двух таблиц (`42P01`), snapshot показывает
`storage: "requires_schema"`, prepare/apply возвращают `SCHEMA_REQUIRED`, а SSR
использует проверенный built-in fallback. Никакая migration автоматически не
запускается. Если сохранённое назначение исчезло из compiled каталога либо
несовместимо, server reader возвращает проверенный fallback с
`requiresRecovery: true`, сохраняя исходный stored pointer. Повреждённый JSON
и прочие SQL ошибки завершаются безопасным отказом.

Применение назначения влияет на следующее открытие страницы. Открытые Task
Manager/Workshop controllers не получают автоматическую смену renderer из другой
вкладки, их drafts/pending state не перемонтируются. Reference имеет отдельный
фиксированный preset. Это ещё не live switch всех Admin screens и не замена
всего native Payload UI.

Штатная migration
[`20261012_094626_extension_manager_state`](../../src/migrations/20261012_094626_extension_manager_state.ts)
добавляет две таблицы/enum, immutable trigger и populated down guard. Она проверена
exact up/down/up и 13 persistence tests на собственной одноразовой PostgreSQL
fixture, удалённой после проверки. Позже в разрешённом этапе M32 применена к основной
БД штатным Payload migrate: 30 applied receipts, прежние 29 сохранены, две
несвязанные pending migrations не применены. Порядок
операционного применения — [migration runbook](../delivery/03-migrations-and-rollback.md#менеджер-расширений-appearance-state-и-replay-ledger).

Task manager уточнён как инструмент управления людьми и ИИ-агентами.
Для его полной поставки нужны совместимые task package, AI adapter и готовый
runtime; установка только интерфейса не означает готовность агентного исполнения.
Каталог и smoke первого пакета должны различать эти возможности.
Подробности: [контракт исполнения задач](task-management-execution.md).

## 1. Задача и границы

Администратор находит совместимое расширение, понимает его назначение и влияние,
запускает разрешённую операцию и видит проверяемый результат в работающем проекте.
Интерфейс покрывает установку, обновление, включение, отключение и удаление.
Судьба пользовательских данных рассматривается отдельно от кода расширения.

Принят общий install/update/replace lifecycle шаблонных пакетов и связь выпуска
с Мастерской. Произвольный публичный marketplace, установка любого npm-пакета
и поддержка всех hosting-платформ этим решением не утверждены.

Выбран отдельный workspace npm-пакет `@realize/payload-extension-manager@0.1.0`
с Payload-плагином и public contracts/server facade. Целевой контракт delivery
adapter подключает существующего владельца CI/deploy; собственной обязательной
SaaS-платформы или второго execution engine не вводится.

## 2. Что имеется в проекте и что даёт Payload

Исходный аудит — 2026-09-17, состояние уточнено 2026-10-12:

- [Payload plugins](../../src/plugins/index.ts) подключаются из исходной конфигурации.
  Source compiled каталог шаблонов реализован первым срезом; общего installer
  нового npm-кода и подключённого delivery adapter пока нет.
- [Модель декларативных расширений](realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md)
  описывает целевое направление; существующий slice Pages/Content/FormBlock
  не реализует общий lifecycle пакетов.
- [Delivery Realize](../delivery/02-ci-release-deploy.md) имеет собственных
  владельцев исполнения и релиза. Их можно подключить адаптером после проверки
  работоспособности; описание pipeline не подтверждает готовность исполнителя.
- Текущие [workspace packages](../../packages/payload-ai-plugin/package.json)
  не являются автоматически распространяемым каталогом.

Плагины расширяют Payload config; пользовательские Admin-компоненты включаются
через import map, production-приложение собирается средствами Next.js, изменение
схемы требует миграционного процесса выбранной БД.
Источники: [Plugins](https://payloadcms.com/docs/plugins/overview),
[Custom Components](https://payloadcms.com/docs/custom-components/overview),
[Production Deployment](https://payloadcms.com/docs/production/deployment),
[Migrations](https://payloadcms.com/docs/database/migrations).

**Архитектурный вывод для нашего продукта:** добавление нового серверного кода,
коллекций или renderer проходит управляемую сборку и доставку приложения.
Запись строки в БД каталога не устанавливает такой плагин в работающий build.
Настройки уже включённого кода могут изменяться без пересборки, если это
предусмотрено контрактом самого расширения.

## 3. Какие сущности управляются

| Сущность                         | Смысл                                                                                        | Как применяется изменение                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| npm-пакет                        | Единица поставки кода и зависимостей                                                         | Package manager, lockfile, build/deploy при изменении приложения                          |
| Payload-плагин                   | Подключение функций через Payload config                                                     | Пакет плюс регистрация, конфигурация и при необходимости миграции                         |
| Модуль                           | Продуктовая функция, например task manager                                                   | Может поставляться одним пакетом; это не отдельный package manager                        |
| Новый тип виджета/блока          | Renderer, схема и допустимые настройки                                                       | Поставка кода и регистрация                                                               |
| Экземпляр установленного виджета | Конкретный блок с контентом и настройками                                                    | Операция данных, если схема/renderer не меняются                                          |
| Шаблонный пакет                  | Код целой композиции, собственные UI-примитивы, палитры, settings schema и публичный adapter | Точная dependency/registration в подготовленном build; общий install/activation lifecycle |
| Preset/набор настроек            | Версионированные данные для уже установленного совместимого пакета                           | Валидированный импорт/выбор без заявления об установке нового кода                        |

«Другие сущности» добавляются только после определения их формата, владельца
данных и операций. Один интерфейс может показывать разные типы, но не должен
выдавать создание экземпляра за установку нового кода.

### 3.1. Шаблоны как единое семейство расширений

Admin/frontend используют один manifest protocol и lifecycle, с различимыми
target/screen contracts и независимыми назначениями. Самодостаточный пакет
может предоставить свои layout, settings, palette/assets и primitive
implementations; структура `src/` не навязывается installer-ом. SDK задаёт
публичные exports, props/ref/events/accessibility, обязательные capabilities,
совместимость и settings schema. Полный контракт принадлежит §11 Мастерской;
этот менеджер потребляет ту же schema, не вводит собственный template manifest.

По целевому контракту Мастерская создаёт immutable DesignPackage из принятой
revision и передаёт его в общий каталог. Стандартный пакет от другого поставщика проходит тот же путь;
отдельного Workshop installer нет. «Темы и шаблоны» показывает package/preset,
preview, settings и назначение, общий executor выполняет lifecycle. Соответствие
manifest не заменяет допуск источника host policy и не изолирует код.

## 4. Варианты продукта и предлагаемый MVP

| Вариант                                          | Пользовательский сценарий                                                       | Объём и ограничения                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A. Управляемый каталог                           | Установка наших и проверенных сторонних расширений с известным рецептом         | Рекомендуемый MVP; точные версии, совместимость, lifecycle и проверки каждого элемента                                        |
| B. Подключение сторонних пакетов через адаптацию | Разработчик описывает рецепт и проверяет plugin, затем публикует его в каталоге | Следующее расширение; проверка пакета не заменяется его наличием в npm                                                        |
| C. Любая npm-строка из Admin                     | Попытка установки произвольного пакета                                          | Отдельный продукт с большим объёмом; нельзя гарантировать регистрацию, совместимость или удаление без пакето-зависимых знаний |

Первый целевой installation cycle требует один Realize package и один
поддерживаемый host delivery adapter. Каталог расширяется после install/update/
replace/recovery этого пакета. Installer Task Manager дополнительно проверяет
его data/schema/runtime контракт; принятие шаблона не подтверждает установку
предметного модуля.

| ID    | Требование первой версии варианта A                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| EM-01 | Каталог: описание, поставщик, лицензия, точная версия, changelog, поддерживаемые hosts, зависимости, данные и требуемые возможности |
| EM-02 | Установленные расширения: фактическая версия работающего приложения, желаемая версия, доступные действия и причины ограничений      |
| EM-03 | Проверка перед операцией: права, compatibility, зависимости, конфликты, executor, ресурсы/доступы по контракту адаптера             |
| EM-04 | План изменения: состав пакетов/регистраций/схемы, необходимость deploy, судьба данных, проверки и возможность восстановления        |
| EM-05 | Установка и обновление из каталога через изолированную подготовку и host delivery                                                   |
| EM-06 | Включение, отключение и удаление с сохранением данных либо объяснимым отказом, когда сохранность не обеспечена                      |
| EM-07 | История операций: этап, причина ожидания/ошибки, время, инициатор, версии, результат, допустимые retry/cancel                       |
| EM-08 | Проверка после deploy: фактическая версия, готовность Admin/API и минимальный сценарий расширения                                   |

Вне предлагаемого MVP: публичный marketplace с оплатой/рейтингом, загрузка
произвольного JS/архива, любые npm URL, обновление ядра Payload/Next/Node,
любые хостинги, cluster orchestration, самообновление менеджера из его Admin,
универсальная очистка данных и снятие ограничений host-проекта.

## 5. Bootstrap, роли и архитектурные границы

Сам менеджер сначала подключается разработчиком обычным способом: зависимость,
plugin config, auth/access, схема, сборка и deployment adapter. Это одноразовая
подготовка host-проекта. После неё администратор управляет совместимыми
расширениями из интерфейса. Обещать установку менеджера через ещё отсутствующий
менеджер нельзя.

| Участник                  | Ответственность                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Разработчик/оператор host | Bootstrap, доверенные источники, adapter, credentials, backup/recovery, правила доставки      |
| Администратор расширений  | Каталог, план изменения, запуск разрешённых операций, просмотр результата                     |
| Наблюдатель               | Чтение состояния и разрешённого журнала без запуска операций                                  |
| Поставщик расширения      | Совместимость, рецепт подключения, migrations/data contract, обновления и инструкция удаления |

Права устанавливаются host callbacks, а не полем `users.roles` по умолчанию.
Право редактировать контент не даёт права устанавливать код. Подтверждение
конкретного плана в UI следует политике host и не заменяет его release approvals.

**Admin/API** хранит запрос и показывает состояние; проверяет полномочия,
валидирует план и обращается к executor adapter. Пользователь не передаёт
shell-команды. Интерфейс не содержит секретов CI или production.

**Каталог** хранит опубликованный паспорт конкретной версии. Источник каталога
может быть статическим или удалённым; собственный marketplace не обязателен.
Прочитать паспорт можно до исполнения кода пакета.

**Исполнитель** подготавливает изолированную копию исходников, точные зависимости,
регистрацию, import map/types и миграционный план, запускает проверки и сборку.
Доставку и работу с production БД выполняет через разрешённый host-процесс.
Production HTTP request не запускает package manager внутри работающего приложения.

**Host integration** задаёт управляемую точку регистрации и настройки расширений.
В произвольный `payload.config.ts` нельзя надёжно вставлять строку по шаблону:
bootstrap создаёт или подключает явную точку композиции, не заменяя пользовательский
config. Изменения имеют доступный для просмотра diff.

Для Realize следует использовать существующих владельцев execution/delivery,
не создавать второй независимый механизм релизов. Для других проектов —
адаптер их CI/deploy без обязательного AI control plane.
Serverless-проект требует внешнего исполнителя; наличие writable filesystem
в Admin runtime не принимается за обязательное условие.

## 6. Операции и сохранность данных

| Операция  | Контракт результата                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| Install   | Точная версия, зависимости и регистрация доставлены; схема подготовлена; health/smoke подтвердили работу                   |
| Enable    | Открыты возможности установленного расширения; если меняются schema/compiled registration, требуется delivery              |
| Update    | Совместимое изменение версии, проверены dependents и миграции; данные и конфигурация сохранены по плану                    |
| Disable   | Закрыты новые операции UI/API, остановлено принятие jobs; текущие работы завершены/отменены по контракту; данные сохранены |
| Uninstall | Код и регистрация удалены после анализа зависимостей; данные сохранены проверенным механизмом либо операция блокируется    |
| Purge     | Отдельное необратимое удаление выбранных данных/схемы по специальному плану; не входит в обычную кнопку удаления и MVP     |

Для template package **install** и **activation** — отдельные результаты.
Install включает exact dependency/lockfile/exports в проверенную сборку и требует
runtime-подтверждения фактической версии. Activation назначает совместимый
package/preset/mode и settings revision одному target; установка не выбирает
шаблон автоматически. Переключение уже включённых в build пакетов может
выполняться без новой сборки, если это поддержано host adapter.

Settings принадлежат установке, immutable код — пакету. Preview не меняет
рабочее назначение; apply использует revision/CAS и сохраняет activation receipt
и предыдущий совместимый выбор. При update проверяются settings schema и
зависимые module presentation contracts. При dirty/pending команды switch
блокируется до обеспечения сохранения controllers/drafts/frozen inputs/UUID.
Uninstall активного пакета недоступен без рабочей замены. Recovery surface
позволяет восстановить назначение при ошибке renderer; rollback build проверяется
отдельно и не выдаётся за возврат палитры или настроек.

Отключение должно проверяться на сервере, а не только скрывать пункт меню.
Расширение указывает, поддерживает ли изменение состояния без пересборки.
При отсутствии такого контракта менеджер планирует build/deploy.

Удаление коллекции из Payload config может привести к разрушительной миграции.
Поэтому «сохранить данные» требует конкретного проверенного решения: удержание
необходимой схемы, архив с проверенным восстановлением либо остановка операции
до подготовки такого пути. Генератор миграций не должен автоматически применять
`DROP` под названием безопасного удаления. Схема после удаления и следующее
повторное подключение тоже включаются в проверку.

До удаления проверяются другие плагины, задачи/страницы/блоки, uploads, задания
и ссылки на owned collections. Удаление renderer не должно уничтожать содержимое
страниц; при отсутствии согласованного fallback операция блокируется.
Нельзя удалять общую auth/media-коллекцию или данные другого расширения.

Rollback кода и восстановление данных различаются. Предыдущий build может быть
несовместим с уже применённой миграцией. Автоматический откат допускается только
при доказанной совместимости; иначе показывается «требуется восстановление»
с отдельным планом. Универсальное обещание «откатить любую установку одной кнопкой»
не входит в контракт.

## 7. Паспорт расширения и контракт исполнителя

Предлагаемый паспорт описывает **одну неизменяемую версию**. Финальная schema
согласуется с существующей декларативной моделью проекта и не копирует её в
параллельный registry без определения владельца.

| Группа        | Обязательные сведения                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Идентичность  | ID расширения, version, package name, registry/source, целостность артефакта, publisher, лицензия            |
| Совместимость | Проверенные Payload/Node/Next/React/DB, зависимости/конфликты, нужный adapter protocol                       |
| Подключение   | Plugin export, версия рецепта регистрации, schema настроек, допустимые namespaced коллекции/routes/endpoints |
| Возможности   | Admin views, API, schema changes, uploads/jobs/внешние сервисы; необходимость build/deploy                   |
| Данные        | Owned collections/поля, миграции, сохраняемые данные, uninstall/reinstall и ограничения rollback             |
| Проверки      | Health/smoke criteria, upgrade matrix, документы и release notes                                             |

Для шаблонов паспорт включает contract из §11 Мастерской: targets/screens,
settings schema/version, palette/modes/assets, UI slots и объявленное fallback
наследование, presentation overrides, source revision/evidence. Manifest protocol
и package/settings версии различаются. Installer не допускает отсутствующих
обязательных primitive slots или несовместимый screen contract под видом
частично готового пакета. Первые packages имеют независимый от AI SDK.

Паспорт не является произвольным исполняемым shell-скриптом, полученным от
пользователя. Нужный build recipe реализует доверенный adapter. Integrity
проверяется для зафиксированного артефакта; версии не меняются молча через `latest`.
Policy lifecycle scripts и источник транзитивных зависимостей задаются отдельно.
Стандартный серверный npm-плагин работает с полномочиями host-приложения;
декларация возможностей не создаёт sandbox и не изолирует недоверенный код.

Контракт executor включает: protocol version, идентификатор host/environment,
capabilities по операциям, heartbeat, проверку предварительных условий,
идемпотентную отправку, состояние/журнал, cancel/retry/reconcile и ссылки на
результат сборки/deploy. Credentials передаются через защищённый механизм host;
журнал хранит безопасные ссылки и очищенные ошибки.

Источники истины разделены явно: manifest/lockfile/config задают состав
артефакта; работающий deployment сообщает фактические версии; запись операции
хранит намерение и историю. UI не объявляет желаемую версию установленной,
пока runtime не подтвердил её. Изменение проекта вне менеджера обнаруживается
как расхождение; следующий план пересчитывается до применения.

## 8. Исполнение, очередь и восстановление

Предлагаемый основной путь:

1. Выбор расширения и операции; проверка прав и совместимости.
2. Preflight исполнителя, зависимостей и host; предварительный план подготовки.
3. Запуск подготовки в разрешённых границах, постановка в очередь и получение
   lease исполнителем; этот шаг не разрешает изменение production.
4. Подготовка исходников/lockfile/config, генерация и review миграционного плана,
   проверки и production build в изоляции; формирование окончательного плана.
5. Применение host policy/approvals к конкретным неизменяемым diff, миграциям
   и артефакту сборки с их идентификаторами; повторная проверка актуальности host.
6. Backup/миграции/deploy в порядке, заданном host adapter; до опасного этапа
   проверяются условия восстановления и текущая схема.
7. Проверка фактической версии и smoke; фиксация результата и завершение операции.

Предварительный план не подменяет окончательный. Если после принятия изменились
diff, зависимости, миграции, артефакт или исходное состояние host, разрешение
не переносится автоматически: формируется новый план и повторно применяется
политика согласования. Обязательность ручного подтверждения задаётся host;
проверка соответствия разрешённому результату обязательна в любом режиме.

Порядок миграции и переключения приложения зависит от совместимости старого
и нового кода со схемой. Паспорт/adapter указывает maintenance window, если
оно необходимо. Одна фиксированная последовательность для любых пакетов не обещается.

| Состояние интерфейса    | Что означает и какое действие доступно                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Требуется настройка     | Нет готового adapter/credentials/capability; очередь не создана, указано что настроить                         |
| План готов              | После подготовки доступны окончательные diff, миграции и артефакт; можно разрешить применение по политике host |
| Ожидает исполнителя     | Исполнитель доступен, но занят; видны причина, время ожидания и предел очереди                                 |
| Выполняется             | Видны текущий этап, последнее событие и время, а не выдуманный процент                                         |
| Требуется действие      | Нужен конкретный input/approval по host policy; это отдельное состояние с объяснением                          |
| Завершено               | Реально работающая версия проверена; открыт переход к расширению                                               |
| Ошибка/ожидание истекло | Указаны этап, причина и безопасный следующий шаг; сохранена история попытки                                    |
| Восстановление          | Исход применения выясняется или выполняется допустимый recovery; новый deploy заблокирован                     |

Обязательные условия, чтобы не повторять неограниченное ожидание релиза:

- Готовность проверяется именно для операции и host/environment. Один флаг
  «включено» или живой процесс без capability недостаточен.
- Ошибка preflight может попасть в аудит, но не создаёт исполняемое задание
  с ложным статусом «в очереди». При потере readiness после принятия нужен
  reconcile, а не вечное ожидание.
- Раздельны срок ожидания очереди, deadline исполнения и lease/heartbeat.
  Предлагаемый стартовый предел очереди — 5 минут; heartbeat ≤30 секунд,
  stale после 90 секунд. Deadline выполнения зависит от adapter и показан
  до старта. Эти значения требуют согласования и тестов.
- Одновременно меняет зависимости/схему только одна операция на host/environment.
  События имеют монотонный порядок, execution attempt и fencing от устаревшего worker.
- Повтор запроса возвращает ту же операцию. Retry создаёт связанную попытку
  после сверки фактической версии и состояния миграций; не повторяет deploy вслепую.
- Cancel до необратимого этапа останавливает выполнение и освобождает ресурсы;
  во время миграции/переключения не обещает мгновенный безопасный обрыв.
- После рестарта worker или Admin сверяются durable state и deployment.
  Нельзя запускать второй deploy лишь потому, что потеряно последнее сообщение.

Операция установки — технический процесс доставки. Задача task manager имеет
свои статусы, назначения и план исполнения; одна задача может связывать несколько
реальных runs/jobs. Installer передаётся как этап через адаптер владельца доставки,
а не как второй исполнитель того же job. Не каждая задача требует установки или release.

## 9. Референсы будущего интерфейса

После согласования варианта продукта подготовить:

- Каталог с карточками, поиском и фильтром совместимости.
- Страницу расширения: описание, версии, требования, зависимости, данные.
- Установленные расширения с фактическим состоянием и доступными действиями.
- План установки/обновления: что изменится, этапы и судьба данных.
- Операцию с прогрессом, причиной ожидания, ошибкой и восстановлением.
- Отключение/удаление с зависимостями и явным сохранением данных.
- Первичную настройку: отсутствующий исполнитель, успешное подключение,
  неподдерживаемый host и недостаточные права.

Использовать фиктивные версии/операции, отдельно показать все ошибочные состояния.
Наличие кликабельного референса не означает работающую установку. На этом этапе
не запускаются package manager, миграции и production deploy из кнопок макета.

## 10. Критерии приёмки

| ID       | Проверка                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-EM-01 | Bootstrap выполнен на чистом совместимом Payload-host; task manager устанавливается и без менеджера; готовность AI проверяется отдельно от наличия пакета                           |
| AC-EM-02 | Из Admin выбранный пакет действительно появляется в новом работающем build; совпадают package version, runtime и операция                                                           |
| AC-EM-03 | Нет исполнителя, heartbeat устарел, нет capability или зависимость несовместима — запуска не происходит, причина видна до очереди                                                   |
| AC-EM-04 | Занятый executor, выход за deadline и падение worker дают ожидаемые состояния; бесконечная очередь невозможна                                                                       |
| AC-EM-05 | Повторный клик/HTTP retry не создаёт вторую установку; конкурирующее изменение host отклоняется или пересчитывает план                                                              |
| AC-EM-06 | Build/migration/deploy/smoke failure не помечается успехом; протестирован предусмотренный recovery и сохранены исходные данные                                                      |
| AC-EM-07 | Disable закрывает UI/API и jobs по контракту; enable восстанавливает работу с теми же данными                                                                                       |
| AC-EM-08 | Uninstall сохраняет/архивирует данные проверенным способом или блокируется; повторная установка и восстановление проверены                                                          |
| AC-EM-09 | Чужие schema/коллекции/файлы не изменены; зависимости и renderer в опубликованном контенте проверяются перед удалением                                                              |
| AC-EM-10 | Обычный редактор не устанавливает код через прямой API; input не становится shell-командой, secrets не попадают в browser/logs                                                      |
| AC-EM-11 | Рестарт во время операции и внешнее изменение версии обнаруживаются; после reconciliation UI показывает фактический результат                                                       |
| AC-EM-12 | Согласованные референсы воспроизведены и проверены в браузере: темы, клавиатура, 1440/768/390 px и основные ошибки                                                                  |
| AC-EM-13 | Изменение diff/миграций/артефакта или исходного состояния после принятия плана запрещает применение прежнего разрешения                                                             |
| AC-EM-14 | Template package подключён на двух совместимых hosts без копирования исходников в app; совпадают manifest/digest, exports и UI contract                                             |
| AC-EM-15 | Installed и active состояния различаются; preset import не устанавливает код; preview не меняет рабочие назначения Admin/frontend                                                   |
| AC-EM-16 | Смена renderer/UI primitives сохраняет drafts/pending UUID либо блокируется; несовместимые settings/slots не меняют активное назначение                                             |
| AC-EM-17 | Выпуск из Workshop revision проходит тот же install/update/replace/recovery цикл; source/evidence/digest/build/activation receipt связаны, потеря ответа не создаёт вторую операцию |

Проверки adapter включают установку, обновление между двумя версиями, сбой и
восстановление на выделенном тестовом host. Наличие UI-кнопок и unit tests
в отдельности не является приёмкой installer.

## 11. Этапы, зависимости и решения для обсуждения

Для шаблонов принят порядок: общий SDK/contract → один Realize package и host/UI
adapter → минимальный общий installer с подтверждённым install/update/replace
cycle → Workshop starter/preview/package release в тот же каталог → остальные
Admin screens и первый frontend package. SDK/package/host и bounded appearance
API, shell choice и read-only installed inventory реализованы и установлены в
основную локальную службу. Доставка нового кода, Workshop producer и первый
frontend renderer остаются следующими этапами; текущая приёмка не подтверждает
общий production installer или новые grants.
Task Manager расширяет каталог после независимой проверки своего lifecycle.
У каждого продукта сохраняется порядок «ТЗ → референсы → реализация → внедрение».

Если первый релиз обязательно должен устанавливаться только из Admin, реализация
минимального installer/adapter входит в зависимость этого релиза. Это не требует
создания универсального marketplace до работы над задачами.

| Решение              | Предлагаемый вариант                                                         | Влияние альтернативы                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Каталог              | Наши и проверенные пакеты                                                    | Произвольные npm требуют отдельного процесса адаптации и доверия                                                           |
| Первый host          | Один выбранный production adapter                                            | Несколько hosting-платформ увеличивают разработку и матрицу восстановления                                                 |
| Delivery в Realize   | Использовать существующего владельца после проверки готовности               | Разработка нового delivery-контура — отдельный архитектурный scope                                                         |
| Установка менеджера  | Один bootstrap разработчиком                                                 | Полностью самостоятельный onboarding требует управляемой платформы                                                         |
| Данные при удалении  | Сохранение или блокировка до безопасного плана                               | Очистка данных — отдельная функция с собственными критериями                                                               |
| Приоритет            | SDK/Realize package/host, затем общий template installer и Workshop producer | Пользовательская установка из Admin требует этого минимального installer; built-in registry не заменяет конечный lifecycle |
| Поставка и поддержка | Совместимый с task manager способ registry/versioning                        | Платный marketplace/лицензирование отдельно меняют бизнес-модель                                                           |

До оценки реализации выбираются первый host adapter, источник каталога, политика
регистрации, retention/reinstall для первого пакета и владелец поддержки.
Стоимость оценивается отдельно для Admin/catalog, executor integration,
миграций/recovery и проверок совместимости. Сроки без этих решений не фиксируются.

# Передача задачи: шаблоны Admin и подготовка рефакторинга

Дата: 2026-10-12. Статус: **разработка остановлена пользователем; качество результата не принято**.
Это датированный документ передачи. Он фиксирует техническое состояние и границы
проверок, а не разрешает следующие изменения или заменяет проектные правила.

## Решение пользователя и порядок продолжения

Пользователь отклонил качество выполненной задачи: слишком большой накопленный
состав изменений, недостаточные пошаговое выполнение и согласование, неудобная
структура CSS, проблемы naming/структуры, дублирование и лишний код. Успешные
тесты и работающий переключатель не закрывают эти замечания.

Разрешён текущий полный add → commit → push вместе с этим документом. Это
фиксация состояния перед рефакторингом, а не одобрение архитектуры или интерфейса.
Рефакторинг в этом шаге **не начат**. Следующий агент сначала согласует небольшой
первый этап и конкретный состав файлов; последующие commit/push и deployment
требуют разрешения пользователя. Бэкап БД пользователь ранее исключил.

Перед работой прочитать `AGENTS.md`, `.ai/README.md`, применимые правила/checks
и `.codex` procedures. `.ai-workspace` хранит локальные рабочие материалы.
Исправление самого рабочего слоя ИИ — отдельная задача через его процесс
эволюции, не попутная часть рефакторинга шаблонов.

## Что было сделано

| Этап | Результат | Граница |
| --- | --- | --- |
| Template foundation | Общий serializable/React SDK `@realize/template-contracts@0.1.0`, Admin пакет `@realize/template-realize@0.1.0`, adapter/context в UI-kit | Первый пакет поддерживает только Admin; frontend renderer отсутствует |
| Appearance manager | Самостоятельный `@realize/payload-extension-manager@0.1.0`: compiled каталог, settings, prepare/preview/apply/recover, PostgreSQL CAS и immutable UUID ledger | Работа с уже включённым кодом; установка нового кода не реализована |
| Выбор оболочки | Отдельный native/template state, policy/defaults, вход через `/admin`, самостоятельный `/system`, selector/preview/recovery/history | Native Payload не превращён в собственный template package; остальные редакторы автоматически не перенесены |
| Inventory и доставка | Карточки установленных Payload/Realize, строгий GET inventory, действия через существующие controllers; M32-only и обновление существующей службы | Выполнены технические проверки текущего среза; пользователь отклонил качество и требует рефакторинг |

Concrete Admin layout перенесён из UI-kit в пакет Realize. Task Manager и
Мастерская используют neutral host. Референс Task Manager использует фиксированный
Realize preset отдельно от рабочего назначения. Документация по этому решению:
[ADR-0018](../architecture/decisions/ADR-0018-self-contained-template-packages.md),
[System Admin](../architecture/system-admin-shell.md),
[менеджер расширений](../specifications/extension-management.md),
[Мастерская](../specifications/design-workshop.md).

## Владельцы кода, с которых начинать

| Владелец | Ответственность |
| --- | --- |
| `packages/template-contracts/` | Manifest, compatibility, selection/settings и React presentation/UI contracts |
| `packages/template-realize/` | Полный concrete Admin layout, приватные components, palette/assets/settings и собственные primitives |
| `packages/ui-kit/` | Общие primitives, UI adapter/context, default theme и fallback |
| `packages/payload-extension-manager/` | Pure catalog/appearance/admin-shell/inventory, DTO/schemas, state/replay persistence, server facade и endpoints |
| `src/plugins/extensionManager.config.ts` | Trusted registry, scope/defaults, host ACL/runtime callbacks |
| `src/components/admin/system-shell/` | Session/ACL, host policy, template provider/host, navigation registry и runtime identity |
| `src/components/admin/extensions/` | Appearance UI/controllers, installed cards, shell selection и draft/frozen request handling |
| `src/components/admin/task-manager/` | Рабочий Task Manager; `reference/` содержит отдельный UI референс и fixture данные |
| `src/app/(system-admin)/` | Самостоятельные защищённые Next routes/layout; не вложены в Payload root |
| `scripts/migrations/extension-manager-state.mjs` | Источник генерации M32 SQL/snapshot guards; generated migration/types обновлять генераторами |

Native root `src/app/(payload)/layout.tsx` подключает Payload CSS и `custom.scss`.
Realize root `src/app/(system-admin)/layout.tsx` имеет отдельные html/body/provider
и не импортирует эти стили. Реальная изоляция каскада проверяется в браузере;
одних границ каталогов для этого недостаточно.

## Рабочая установка на момент передачи

- Темы и шаблоны: `http://localhost:3000/system/appearance#appearance-installed`.
- Рабочие задачи: `http://localhost:3000/system/task-manager`.
- Публичный референс: `http://localhost:3000/reference/task-manager`.
- Защищённый референс: `http://localhost:3000/system/task-manager/reference`.
- Основной вход: `http://localhost:3000/admin`; по умолчанию выбран Realize.

На 2026-10-12 существующий `realize-web.service` использует сборку
`_HmknEVf1nCPefAPVruPV`, PID `103847`, порт `3000`. Entry:
`.next/admin-shell-runtime-f3a1-v2/server.cjs`. Новый сервер или порт не создавался.
Операторский override — `90-admin-shell-activation.conf` в существующем user unit.
Эти локальные bundle/systemd artifacts не поставляются самим Git commit.

После переключения существующие control plane, execution worker и managed MCP
перечитали binding. PostgreSQL, media service и developer MCP сохранили PID.
Bounded search `sourceVersion`:
`5866bbfc3cf21b0059b8985e93addb2717505a1a526a9403e88563a908c6f546`.
Это версия ограниченного набора search sources, **не digest всего приложения**.

В основную БД штатным Payload migrate применена только
`20261012_094626_extension_manager_state` (M32): две таблицы state/receipts,
10 indexes, 12 columns и immutable SQL trigger. Всего 30 migration receipts;
прежние 29 сохранены. `20260925_170325_design_preview` и
`20260926_112722_workshop_mcp` остаются pending. Не запускать весь pending набор
ради шаблонов. Уже заполненный ledger нельзя очищать или откатывать попутно.

В live проверке оболочка переключалась на native и восстанавливалась в Realize:
shell revision теперь `2`, история сохранена. Appearance settings проверялись
через preview **без apply**. Два временных пользователя удалены; исходные counts
users/admin/live sessions `3/1/1` сохранены. Credential/token в отчёты не записаны.

## Какие проверки действительно выполнялись

В четвёртом этапе прошли 156 targeted tests в 7 suites, scoped lint/headers,
TypeScript и изолированная production build. После build восстановлен tsconfig,
выполнены default typegen и повторный полный typecheck. Предыдущие source этапы
имели отдельные настоящие PostgreSQL fixture проверки миграций, CAS/rollback,
immutable ledger и replay; их количества не складываются с текущими тестами.

15 UI случаев проверяли actual React/CSS с явно mocked API через file URL:
dirty/frozen/retry, incompatible/unverified/schema/ACL, anchors/focus и responsive.
Это не доказательство рабочей session/API. Отдельно прошли 14 live проверок:
native Admin login, anonymous401/customer403, confirmed Payload `3.88.0` и
Realize `0.1.0`, card actions/drafts/focus, 1440/390 light/dark, appearance preview,
native actor preview/dashboard, shell apply/recover и UUID replay. Console/page
errors отсутствовали. Финальный read-only check подтвердил health/readiness,
runtime binding, M32, roles cleanup, очереди и доступность референса.

Это **не** полноценная UX/архитектурная приёмка, проверка всех экранов Task Manager
и Мастерской, pixel parity референса или переносимость на два разных hosts.
Пользовательские замечания к масштабируемости и структуре остаются открытыми.

Локальные подробные логи лежат в текущей задаче
`.ai-workspace/tasks/2026-10-12-admin-template-architecture-f3a1/`:
`TASK.md`, `logs/installed-templates-delivery-report.json`,
`logs/shell-installed-auth-browser.json`, `logs/installed-templates-final-runtime.json`,
`logs/installed-templates-build-proof-v2.json`, `logs/shell-migration-after.json`.
Они игнорируются Git; следующий агент на другом checkout не должен рассчитывать
на их наличие. Значимые факты для передачи сохранены здесь.

## Ошибки доставки и сделанные исправления

Первая попытка standalone выявила stock CommonJS `server.js` в проекте
`type: module`; packaging теперь использует byte-identical `server.cjs`, без
ручного изменения generated chunks. Затем native policy не могла получить
Payload version: для публичного `getDependencies` недостаточно одного
`package.json`. `next.config.ts` теперь трассирует физический
`payload/dist/index.js` вместе с metadata. Этот вызов проверен из реального
packaged cwd. Старый runtime восстанавливался при отказах; итоговый V2 принят
техническими live проверками. Recovery не удаляет additive M32.

Локальный packaging также исключил посторонние task/cache traces и сохранил
собственный custom distDir с относительным `.next` alias. Это временная
операторская процедура текущей доставки, а не готовый installer продукта.
Не удалять `.next/**` или task artifacts общей cleanup-командой: действующий
процесс использует runtime bundle, старые bundles нужны для recovery.

## Материал для первого аудита рефакторинга

Ниже bounded inventory, не полный semantic audit и не автоматический приговор
каждому файлу. Замечания пользователя выше сохраняются как открытые требования.

- В пяти owners насчитан 41 CSS Module: Realize — 15, UI-kit — 13,
  appearance UI — 1, Task Manager reference — 12; host system-shell CSS не содержит.
  В `template-realize/src/layouts/admin/` — 60 файлов, из них 11 CSS Modules.
  Нужно проверить ownership tokens/variants/reset/breakpoints и повторения;
  объединение всех стилей в один global файл заранее не согласовано.
- Подтверждено повторение sorted-JSON сериализации в
  `extensionDraftChanged.util.ts` и `getInstalledAssignmentIssue.validator.ts`.
  Возможный общий owner должен оставаться browser-safe; перенос через Node
  hashing helper нарушит клиентскую границу.
- В `useInstalledTemplates.hook.ts`, `useAdminShellManager.hook.ts` и
  `useExtensionManager.hook.ts` повторяется loading/generation/mounted scaffold.
  Инициализация domain drafts различается: объединение требует проверки
  stale/unmount/frozen поведения, а не механического удаления строк.
- Кандидаты декомпозиции: `TaskDraftEditor.component.tsx` (509 строк),
  `TaskManagerWorkbench.component.tsx` (456), `Workspace.module.css` (677),
  `TaskDetailDrawer.module.css` (520), `ExtensionManager.component.tsx` (334),
  `useExtensionManager.hook.ts` (324). Размер сам по себе не доказывает нарушение.
- `SystemAdmin*` legacy naming в concrete package и host требует semantic audit.
  Public exports `/admin` и `/ui` имеют consumers; переименование должно включать
  их миграцию и удаление старых ссылок. Разные owners не являются двумя копиями shell.
- `taskManager.fixtures.ts` содержит вымышленные reference данные. Их нельзя
  объявлять реальными Task DTO, Git synchronization или готовым исполнением ИИ.

Нормативный вход naming/structure/CSS ownership:
[стандарт именования и структуры](../architecture/code-naming-and-structure.md),
[UI-kit](../architecture/ui-kit.md),
[структура проекта](../architecture/project-structure.md).

## Предлагаемый следующий шаг — до изменения кода

Сначала read-only аудит конкретных перечисленных owners: карта imports/styles,
фактические нарушения naming/структуры, подтверждённые повторы и неиспользуемые
файлы. Представить короткий список проблем с точными paths и последствиями,
предложить конечную структуру и **один** ограниченный первый срез для согласования.
После решения пользователя реализовать только этот срез, проверить его и показать
результат перед следующим шагом. Общую массовую переработку здесь не начинать.

Сохранять reference отдельно от рабочей страницы, независимость roots,
package/host границы, DTO/ACL, данные, CAS/replay, drafts и frozen UUID.
Installer нового кода (`DELIVERY_ADAPTER_UNAVAILABLE`), Workshop starter/producer/
release bridge, frontend renderer и полный перенос native screens остаются
незавершёнными функциями. Их разработка не входит в начальный cleanup без отдельного
согласования.

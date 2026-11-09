# Референс Task Manager → RealizeAI Control Panel — TASK-22 / ONE-03

Название шаблона актуализировано 9 ноября 2026 года. Дата, результаты исходного
исследования, коды задач и пути evidence сохранены.

Дата: 19 октября 2026 года. Родитель: TASK-9. Тип результата: исследование и
передача следующему шагу; target — оболочка Admin и общие элементы RealizeAI Control Panel.

## Результат и бриф

Референс уже использует общий `SystemAdminShell` из `template-realize`.
Рабочий renderer использует тот же компонент. Основа RealizeAI Control Panel — эта композиция и
её взаимодействия с дальнейшим развитием нейтрального host-контракта.
Копирование всего Task Manager вместе с fixtures и controllers не требуется.

Для администраторов с разным набором модулей сохраняется одно глобальное
назначение Admin. Пункты меню, содержимое, права и доступные действия приходят
от host/modules; перечень разделов демонстрации не становится фиксированным
списком экранов RealizeAI Control Panel. Сайт имеет самостоятельное назначение и композицию.

В этом шаге зафиксированы каркас, верхняя и боковые панели, footer, общие
компоненты, состояния и переносимые решения. Выполнены browser/screenshot
сравнения desktop/tablet/mobile и light/dark. Код приложения, настройки
оформления, рабочие задачи и эталон не менялись. Запись Task Manager относится
только к состоянию и результату TASK-22.

Основания: [TASK-20](2026-10-19-template-coverage-audit.md),
[TASK-21](2026-10-19-template-switching-browser-audit.md),
[design-workshop §11](../specifications/design-workshop.md#11-темы-компоненты-и-качество),
[ADR-0018](../architecture/decisions/ADR-0018-self-contained-template-packages.md),
[System Admin](../architecture/system-admin-shell.md).
`canonical_doc_decision: not_contract_level`: отчёт не меняет SDK, политику
доступа или архитектурный контракт. Состав релиза и необходимые расширения
контрактов уточняются в уже созданных TASK-23…27.

## Точный источник и версия

- Целевой образец: `/system/task-manager/reference`.
  [Защищённый route](<../../src/app/(system-admin)/system/task-manager/reference/page.tsx>)
  проверяет admin и открывает общий workbench с фиксированным preset.
- В этой задаче браузер открыл публичный `/reference/task-manager`:
  [route](<../../src/app/(reference)/reference/task-manager/page.tsx>) использует
  тот же [TaskManagerWorkbench](../../src/components/admin/task-manager/reference/TaskManagerWorkbench.component.tsx).
  Это прямое изучение компонента референса без повторного входа в Admin.
- [Reference layout](<../../src/app/(reference)/layout.tsx>) и
  [reference config](../../src/components/admin/system-shell/systemAdminReferenceAppearance.config.ts)
  закрепляют `realize@0.1.0`, palette `realize@0.1.0`, `comfortable / 280`.
  Публичный workbench начинает с light; dark выбирался штатным меню профиля.
- Сервер отдал RSC build `Dfi6Wz9am3HM5TVk5N8El`, как в TASK-21.
  Локальный `.next/BUILD_ID` в момент проверки — `oqz9ae46agFyIsnpoE8ie`;
  он отличается от обслуживаемой версии и не используется как её доказательство.
- Исходники: `main`, `53e938d4a80d1d60b7d06d3ec73d70981854b3a8`.
  Product-файлы сверяются по hash до/после. Полная связь bundle с commit не установлена.
- Chrome через Playwright, отдельные временные contexts; 1440×1000,
  768×1024 и 390×844. На двух узких размерах включён touch input.
  Новых логинов, auth fixtures и экспорта credentials не было.

Общий React-компонент не гарантирует одинаковый CSS во всех route groups.
Повторная матрица защищённого route в этой задаче не выполнялась. Public reference
показал `--ui-layout-gap: 16px`, control token `42px`; в evidence рабочих страниц
TASK-21 recorded gap был `12px`. Причина различия здесь не установлена.
Перенос конкретных размеров в RealizeAI Control Panel требует сравнения host adapters/CSS в TASK-26/51.

## Карта композиции

| Зона               | Что есть в образце                                                                  | Что переносится в RealizeAI Control Panel и кому принадлежит                                                                          |
| ------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Общая сетка        | 100dvh, header, rail, sidebar, main со своей прокруткой, отдельный footer           | Template владеет геометрией, overflow и адаптивностью; host предоставляет content/slots                           |
| Brand              | Знак `r•`, фиолетовый и бирюзовый акценты                                           | Brand slot и существующие assets; текущий знак — часть образца, branding релиза уточняется в TASK-23              |
| Системная rail     | Иконки разделов, активный пункт, раскрытие панели, «Ещё», настройки/избранное       | Общие navigation components и состояния; дерево и доступность приходят от host                                    |
| Навигация раздела  | Группы, разделители, счётчики, поиск, вложенное дерево и меню элемента              | Groups/sections/disclosure/menu — общие; проекты/списки/архив/reset demo — Task Manager                           |
| Верхняя панель     | Context/workspace switcher → поиск → создание → assistant → уведомления → профиль   | Общие визуальные элементы принимают capabilities; workspace switcher и предметные команды остаются у модуля       |
| Контекстная строка | Breadcrumbs, текущий heading, badge типа, назад, основное действие                  | Template отображает семантическую модель страницы; заголовки, маршрут, badge и действия предоставляет host/module |
| Контент            | Tabs, filters, list/table/board, overview, queue, conversations                     | Переносится frame и общая система controls; сами представления и controllers не входят в shell                    |
| Footer             | Сообщение `role=status`, demo notice и «ТЗ 0.9»                                     | Существующий footer slot и отделение от main scroll; рабочее содержание надо определить в TASK-23/38              |
| Overlays           | Dialog, search palette, profile/notification menu, navigation flyout, mobile drawer | Общая геометрия, focus/keyboard и theme context; payload/actions/domain forms остаются у владельца модуля         |

Источники каркаса:
[SystemAdminShell](../../packages/template-realize/src/layouts/admin/SystemAdminShell.component.tsx),
[его CSS](../../packages/template-realize/src/layouts/admin/SystemAdminShell.module.css),
[нейтральный workspace renderer](../../packages/template-realize/src/layouts/RealizeAdminWorkspace.component.tsx),
[TaskProjectSidebar](../../src/components/admin/task-manager/reference/TaskProjectSidebar.component.tsx).

Desktop: header 52 px; rail core 58 px плюс два inset по 8 px — общая колонка
74 px; sidebar 280 px; межблочный gap 16 px. Main начинается с x=378,
header не прокручивается вместе с задачами. Footer находится в отдельной строке
workspace, а не поверх последней строки таблицы.

При ширине ≤900 px rail и sidebar заменяются modal navigation. Desktop context
в topbar скрывается; переход к рабочим средам остаётся в навигации задач.
Drawer ограничен `min(420px, 100vw)`. Вложенная панель раздела использует тот же
navigation model: одного desktop `secondaryNavigation` недостаточно — mobile
content подключается через `navigationItem.panel`.

На ≤600 px скрываются текст поиска, shortcut hint, подпись assistant и текст
основного create action; остаются accessible labels. На coarse pointer
проверенные header actions имеют высоту не менее 44 px. Это свойства
наблюдаемого образца, не приёмка всех touch targets приложения.

## Верхняя панель: внешний вид и реальные действия

| Элемент       | Подтверждённое поведение reference                                                               | Граница переноса                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Context       | Выбор demo workspace, переход в каталог/настройки                                                | Host задаёт допустимые контексты; template не вводит обязательный Workspace для любого модуля               |
| Search        | Ctrl/⌘K, начальный focus в combobox, фильтрация, выбор стрелками/Enter, empty state, Escape      | Паттерн готов; текущий поиск охватывает локальные fixtures и команды, не серверный глобальный индекс        |
| Create        | Палитра видов создания и формы; search command открывает composer                                | В RealizeAI Control Panel отображаются только реальные разрешённые команды; формы и submit принадлежат modules                  |
| Assistant     | Настоящий переход на `/admin/ai`                                                                 | Это ссылка; она не подтверждает встроенный assistant в shell или наследование его оформления                |
| Notifications | Demo события, unread badge, локальное «прочитать все»; после reload снова 5 непрочитанных        | Переиспользуется меню; реальный inbox/persistence/ACL здесь отсутствуют                                     |
| Account       | Имя из `prototypeActors`; account/profile/logout ведут на `/account`, `/account#name`, `/logout` | Нужны реальные actor и auth actions от host; переходы storefront не являются готовым Admin account contract |
| Billing       | Balance/topup открывают сообщение о недоступном разделе                                          | Не считать финансовой интеграцией или основанием добавлять её в первый релиз                                |
| Preferences   | Light/dark немедленно меняет sample; RU/EN и shortcuts предусмотрены общим menu                  | Mode не равен template или palette; владение preferences уточняется вместе с appearance contract            |

Источники: [общий toolbar](../../packages/template-realize/src/layouts/admin/SystemAdminToolbar.component.tsx),
[reference adapter](../../src/components/admin/task-manager/reference/TaskWorkbenchToolbar.component.tsx),
[его handlers](../../src/components/admin/task-manager/reference/useTaskWorkbenchToolbar.hook.ts),
[profile menu](../../packages/template-realize/src/layouts/admin/SystemAdminProfileMenu.component.tsx).
Часть account/assistant действий проверена по коду; переходы из sample на рабочие
страницы и logout в браузере этой задачи намеренно не выполнялись.

## Стили, примитивы и состояния

| Слой               | Текущее положение                                                                             | Передача следующему шагу                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Foundation         | UI-kit задаёт Geist/mono, базовые semantic colors, spacing, radii, focus, motion и light/dark | Сохранить единый источник; определить владение RealizeAI Control Panel tokens в TASK-26/31                             |
| Palette Realize    | Navigation colors/gradient и scrollbars поверх foundation                                     | Это частичная palette, не полная самостоятельная визуальная система                                |
| Settings           | `density` и `panelWidth`; compact проецирует размеры в CSS variables                          | Не заменяет token schema; размер header context сейчас 280/210 px, независим от panelWidth         |
| Сменные primitives | SDK adapter предоставляет Button/Input; Realize оборачивает UI-kit defaults                   | Расширение обязательных slots обсуждается в TASK-25/30/32, а не объявляется готовым                |
| Общие controls     | Dialog, Tabs, Select, SearchInput и другие элементы UI-kit; Radix interactions, Lucide icons  | Переиспользовать владельцев; локальные копии design system внутри страниц не создавать             |
| Domain styles      | Task rows, board, composer, status colors/labels, локальная create-button geometry            | Не переносить весь каталог reference в template; повторяемые общие свойства выделять по назначению |

Источники:
[UiTheme tokens](../../packages/ui-kit/src/theme/UiTheme.module.css),
[Realize palette](../../packages/template-realize/src/palettes/RealizePalette.module.css),
[settings projection](../../packages/template-realize/src/settings/getRealizeThemeStyle.util.ts),
[primitive adapter](../../packages/template-contracts/src/TemplatePrimitives.types.ts),
[presentation contract](../../packages/template-contracts/src/TemplatePresentation.types.ts).
Новые библиотеки, шрифты, изображения и внешние assets не добавлялись.

Наблюдаемые light/dark значения: surface `#ffffff / #191921`, text
`#212137 / #f4f3ff`, primary `#7544de / #b190ff`; базовый font 14 px.
В source radii — 10/14/20 px, spacing scale — 4/8/12/16/20/24/32,
duration — 160 ms. Это фиксация текущей системы, не утверждение будущей token schema.

| Состояние/сценарий                     | Evidence и статус                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Обычное и выбранное                    | `pass`: шесть baseline снимков; активные navigation/tab/radio различимы                                                                                |
| Light/dark                             | `pass`: штатный profile choice меняет shell, menu и новый dialog; снимки сделаны после завершения закрытия меню                                        |
| Search/empty                           | `pass`: Ctrl+K, focus в combobox, нет результатов, ArrowDown/Enter открывает форму создания                                                            |
| Empty module view                      | `pass`: неизвестный текст в фильтре задач показывает empty result                                                                                      |
| Формы/dialog                           | `pass` в проверенной части: светлый creation hub и тёмный task dialog, focus в названии, Escape закрывает; submit не выполнялся                        |
| Notifications/read                     | `pass` для demo: unread исчезает, menu остаётся открытым; после reload read state сброшен                                                              |
| Keyboard/navigation                    | `pass` в проверенной части: skip link фокусирует main; mobile dialog удерживает focus за 24 Tab, закрытие корневого drawer возвращает focus на trigger |
| Вложенная mobile navigation            | `pass`: открывается дерево задач; первый Escape возвращает уровень системного меню, close button закрывает drawer                                      |
| Длинный контент/overflow               | `pass` для текущих fixtures: таблицы имеют собственный horizontal scroll, длинные названия в строках переносятся; tabs прокручиваются на 390 px        |
| Disabled/validation/error              | `source-only`: предусмотрены controls/guards и domain results; полный gallery и все ошибочные формы не проверялись                                     |
| Async loading/pending/recovery         | `unverified`: синхронный demo store не доказывает рабочие сетевые состояния и сохранность pending commands                                             |
| Auth/registration/общие status screens | Не представлены этим sample; нужны отдельные композиции и проверки                                                                                     |
| Полная доступность                     | `unverified`: нет полного аудита контраста, screen reader, zoom, всех targets и reduced-motion                                                         |

## Сравнение с рабочим host и недостающие части RealizeAI Control Panel

| Расхождение                                                                                | Текущий аналог / владелец                                                                        | Продолжение и способ проверки                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Reference напрямую использует concrete shell; рабочие страницы идут через neutral renderer | `SystemAdminTemplateHost` → `RealizeAdminWorkspace` → тот же shell                               | TASK-25/34: общий contract и жизненный цикл; reference сохраняется самостоятельным                        |
| Reference toolbar заполнен; рабочие home/task страницы передают главным образом account    | Host capabilities и module controllers                                                           | TASK-36/43: реальные данные/actions и проверки отсутствующих capabilities, без фиктивных кнопок           |
| Heading/badge/context create reference богаче neutral presentation                         | `TaskWorkbenchBreadcrumbs`, domain CSS; renderer передаёт только items/locale и обычные UiButton | TASK-25/36/38: семантика заголовка и компактных действий; сравнение markup/CSS на трёх ширинах            |
| Sidebar создаётся даже с пустым содержимым; mobile требует panel slot                      | Shared shell/navigation model                                                                    | TASK-35/37: пустая/нет доступных пунктов/длинная/вложенная навигация для разного состава модулей          |
| Футер — опциональный slot, содержимое различается                                          | Reference demo notice; рабочий Task Manager notice; home без footer                              | TASK-23/38: согласовать содержание первого релиза, проверить длинный текст и отсутствие наложения         |
| Auth layout существует, но reference login/register не показывает                          | `RealizeAdminAuthLayout`, host auth forms                                                        | TASK-39/40: вход, восстановление, регистрация/получение доступа с реальной политикой                      |
| Status layout существует отдельно от task footer                                           | `RealizeAdminStatusLayout`; consumer appearance preview status                                   | TASK-49: общая матрица loading/error/404/forbidden/recovery                                               |
| Mode menu не управляет пакетами                                                            | Рабочий `/system/appearance` и `ExtensionManager`                                                | TASK-27/41/42: использовать существующие prepare/preview/apply/recover, спроектировать presentation в RealizeAI Control Panel |
| Native Payload, AI/MCP и сайт не покрыты одним renderer                                    | Выводы ONE-01/02 и их host adapters                                                              | TASK-44…48/50/51: глобальное покрытие, сохранность состояния и отдельная приёмка                          |

Адресные аналоги:
[рабочий Task Manager](../../src/components/admin/task-manager/TaskManagerWorkbench.component.tsx),
[host](../../src/components/admin/system-shell/SystemAdminTemplateHost.component.tsx),
[reference breadcrumbs](../../src/components/admin/task-manager/reference/TaskWorkbenchBreadcrumbs.component.tsx),
[auth layout](../../packages/template-realize/src/layouts/RealizeAdminAuthLayout.component.tsx),
[status layout](../../packages/template-realize/src/layouts/RealizeAdminStatusLayout.component.tsx),
[appearance route](<../../src/app/(system-admin)/system/appearance/page.tsx>),
[extension management](../specifications/extension-management.md).

## Evidence и проверка передачи

Каталог: `.ai-workspace/tasks/2026-10-19-realize-one-03-task9/`.
Локальные снимки не являются новым постоянным reference preset.

| Размер          | Светлый baseline                | Тёмный baseline                | Наблюдение                                                                      |
| --------------- | ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| 1440×1000       | `screenshots/desktop-light.png` | `screenshots/desktop-dark.png` | Rail + sidebar; context/search/actions; отдельный footer                        |
| 768×1024, touch | `screenshots/tablet-light.png`  | `screenshots/tablet-dark.png`  | Drawer вместо двух панелей; context скрыт; table scroll внутри модуля           |
| 390×844, touch  | `screenshots/mobile-light.png`  | `screenshots/mobile-dark.png`  | Icon actions, сокращённый breadcrumb, scroll tabs/table; footer переносит текст |

Дополнительные снимки: `search-keyboard`, `search-empty`, `create-from-command`,
`create-dark`, `task-filter-empty`, `notifications`, `notifications-read`,
`profile-light`, `profile-dark`, `desktop-navigation-expanded`,
`mobile-navigation`, `mobile-navigation-dark`, `mobile-task-navigation`,
`mobile-table-scrolled`. Расширение файлов — `.png`; DOM/a11y snapshots — в `snapshots/`.

`logs/browser-matrix.json` содержит viewport, computed CSS, rectangles и scroll
области. `dark-captures-settled.json` подтверждает, что baseline dark снят без
открытого menu. `interactions.json`, `additional-interactions-confirmed.json`,
`mobile-navigation-scroll.json` фиксируют действия. Две неверные предпосылки
проверочного скрипта исправлены: read-all оставляет меню открытым; первый Escape
в подменю возвращает уровень, а не закрывает весь drawer. Эти timeout не признаны
дефектами продукта; итоговые проверки следуют фактическому UI.

`runtime-version.json`, `product-before/after.json`, `git-inspect-before/after.json`
и `verification.json` связывают результат с версией, проверками и изменёнными
документами. Отдельные браузеры закрыты. Полная проверка защищённого reference,
всех модулей/прав и frontend в ONE-03 не выполнялась. Build, unit suite,
migrations, commit/push и deployment не запускались.

Применены [workshop review](../../.ai/checks/development/frontend/CHECK-DESIGN-WORKSHOP-REVIEW.md)
и [reference pattern check](../../.ai/checks/development/frontend/CHECK-REFERENCE-PATTERN-SCAN-BEFORE-IMPLEMENTATION.md).
Источники и owner map сверены отдельными агентами; browser evidence собран
основным агентом. Оценка относится к исследованию, не к готовности RealizeAI Control Panel.

## Следующий шаг

**TASK-23 / ONE-04 — состав первого RealizeAI Control Panel и план перехода.** Использовать
карту выше для небольшого release scope: shell/header/navigation/content/footer,
auth и управление оформлением; связать каждый блок с готовым owner либо
конкретной доработкой. Затем TASK-24 — стек, TASK-25 — host/screens,
TASK-26 — стили, TASK-27 — lifecycle/UI управления. Реализация начинается после
контрактов и соответствующих workflow/skills в TASK-28/29.

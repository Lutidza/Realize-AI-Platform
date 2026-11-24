# UI-кит Realize

Версия документа: **0.9**, 2026-11-24. Первый срез Template SDK, Realize package
и host внедрён в основную локальную установку. Уже включённые шаблоны и оболочки
выбираются из Admin; installer нового кода и Workshop package pipeline остаются
целевыми. Границы внедрения — [менеджер расширений](../specifications/extension-management.md#раздел-установленных-шаблонов).

`packages/ui-kit` (`@realize/ui-kit`) владеет общими primitives, UI adapter runtime
и fallback. Он используется в чате Admin, каталоге интеграций и настройках
GitHub/Codex. Конкретные шаблоны могут предоставить свои реализации тех же
публичных slots; модули получают их через активный adapter. Подключение остальных
Admin screens и storefront выполняется адресно.

## Сетка содержимого и контейнеры

`UiContainer`, `UiGrid` и `UiGridItem` в `packages/ui-kit/src/layout/` реализуют
общую сетку экранов внутри `panel-content`. Это второй уровень компоновки из
§3.2 Control Panel: каркас панели, сетка содержимого и локальные Grid/Flex
используют общие токены. Это React/CSS primitives, а не блоки схемы будущего
редактора и не новые параметры БД или назначения шаблона.

| Компонент | Публичный контракт | Поведение |
| --- | --- | --- |
| `UiContainer` | Нативные props/ref div, `variant?: fluid \| contained \| reading` | Ширина 100%, центрирование и ограничение max-inline-size по варианту, без добавочного padding |
| `UiGrid` | Нативные props/ref div; `style?: UiGridStyle` | 12 колонок `repeat(12, minmax(0, 1fr))`, независимые column-gap/row-gap, именованный inline-size container `ui-grid` |
| `UiGridItem` | Нативные props/ref div, `span?: 1…12 \| { base?, md?, lg? }` | Число занимает столько колонок на всех уровнях; объект задаёт адаптивные spans |

Default span — 12. В адаптивном объекте пропущенный base равен 12, пропущенный
md наследует base, пропущенный lg — md. Каждый item задаёт собственные
`--ui-grid-span-base`, `--ui-grid-span-md`, `--ui-grid-span-lg`, предотвращая
наследование span от внешнего item при вложении сеток.

**Defaults этого среза**, заданные также в `ControlPanelPalette`:

| Токен | Значение по умолчанию | Где применяется |
| --- | --- | --- |
| `--ui-container-contained-max` | 80rem | Ограниченный контейнер `contained` |
| `--ui-container-reading-max` | 72ch | Контейнер `reading`; фактическая ширина зависит от шрифта |
| `--ui-grid-column-gap` | `var(--ui-space-4)` (16px) | Горизонтальные gutters |
| `--ui-grid-row-gap` | `var(--ui-space-4)` (16px) | Вертикальные gutters |

Общие primitives имеют те же fallback 80rem/72ch/`--ui-space-4`. Это начальные
значения текущей реализации, а не универсальные неизменяемые размеры всех
будущих шаблонов. Экспортируемый `UiGridStyle` расширяет `CSSProperties` двумя
optional строковыми полями `--ui-grid-column-gap` и `--ui-grid-row-gap`.
Потребитель независимо задаёт gutters через эти CSS variables в `style`,
используя CSS-длины либо ссылки на общие spacing-токены. Отдельные дублирующие
gap-props не добавляются. Прямой inline `columnGap` обошёл бы защиту CSS, поэтому
для gutters используется контракт variables, а не `style.columnGap`/`rowGap`.

```tsx
<UiGrid
  style={{
    "--ui-grid-column-gap": "var(--ui-space-6)",
    "--ui-grid-row-gap": "var(--ui-space-2)",
  }}
/>
```

Горизонтальный gutter ограничивается CSS-формулой
`min(var(--ui-grid-column-gap, var(--ui-space-4)), calc(100% / 12))`.
Это верхний предел для очень узких слотов: 11 межколонных промежутков не могут
поглотить всю ширину и создать отрицательное доступное пространство для 12
треков. Если места достаточно, выбранные 16px или 24px сохраняются; row gutter
не сжимается этим правилом. На browser-проверке до исправления вложенная сетка
228px при viewport 320px переполнялась: 11 × 24px = 264px ещё до учёта колонок.
При ширине 228px новый предел column gutter — 19px. Исправление относится к
общему grid owner; локальное уменьшение gap только в demo не используется.
`fluid` не ограничивает доступную ширину; ни один вариант
контейнера не повторяет padding shell.

Container-query уровни `md: 48rem` и `lg: 64rem` определены **только в CSS**.
Они относятся к inline-size ближайшего `UiGrid`, не к ширине viewport. Вложенный
`UiGrid` создаёт свою границу измерения; его items могут оставаться в base,
когда внешняя сетка уже перешла на md/lg. Viewport-порог shell ≤1024px
сохраняется независимо. Media-query hooks, измерения DOM и копия thresholds
в React не используются.

Компоненты не зависят от Next/Payload, не требуют client hooks, новых внешних
зависимостей или расширения template UI adapter. Экран определяет содержание,
подходящий вариант контейнера и spans. Публичный preview содержит локальную
проверочную композицию `ControlPanelGridPreview`: 12 треков, три responsive
карточки, вложенную сетку, независимые gutters и contained/reading-примеры.
Demo принадлежит route preview, а не template renderer, не содержит бизнес-данных
и не сохраняется как редакторская композиция.

Границы этого среза и критерии приёмки описаны в
[контракте внутренней сетки Control Panel](../specifications/realize-ai-control-panel/shell/content-grid.md#content-grid).
Browser-проверка 2026-11-12 прошла: 14 сценариев на восьми ширинах 320…1920px,
оба макета и light/dark. Подтверждены ближайший query container, spans,
отдельные gutters, сужение зазора до 19px в слоте 228px и отсутствие overflow.
Footer сохраняет 36px и положение при прокрутке main; смена макета с заполненной
сеткой не перезагружает document. Typecheck, адресный ESLint, шапки и 68
regression tests прошли. Evidence —
`.ai-workspace/tasks/2026-11-11-control-panel-first-slice/logs/content-grid-runtime.json`.

## Выбор дат

`UiDatePicker` в `packages/ui-kit/src/date-picker/` предоставляет одиночную дату
и диапазон (`mode="range"`), опциональное время (`withTime`), label, description,
required/disabled/error и ограничения календарных дат. Он адаптирует уже
используемый Payload движок `react-datepicker@7.6.0`; `date-fns@4.4.0` отвечает
за строгий разбор и календарные преобразования. Уже установленный
`@floating-ui/react` удерживает popup внутри viewport через стандартный `shift`.
Нового движка или зависимости
от Payload wrapper нет. Input разрешается через активный template adapter;
календарь оформляется scoped CSS Modules и `--ui-*`, наследует тему на месте
без портала в `body`. Календарь открывается кликом или ArrowDown; простой
переход по Tab оставляет возможность ручного ввода. Escape возвращает фокус
и сохраняет неверный черновик для исправления; навигация датами принадлежит
движку. Неверный ручной ввод блокирует отправку формы, сохраняя черновик.

Значение — `Date | null` либо пара таких значений. Часовой пояс, границы периода,
сохранение и запросы принадлежат consumer. `parseUiCalendarDate` /
`formatUiCalendarDate` сохраняют `YYYY-MM-DD` как календарный день без UTC-сдвига.
Диагностика поиска передаёт точные UTC instants; Workflow runs сохраняет
существующий mapper включённых UTC-дней с исключённой следующей полуночью.
Даты Task Manager и сроки MCP автоматически не мигрируются.

## Popover и управляемый список выбора

Корректирующий срез preview Control Panel от 2026-11-11 использует общие
`UiPopover` и `UiSelectMenu`. Нативные `details`/`summary`, локальный raw select
и GET-форма с перезагрузкой признаны ошибочным UI данного preview и заменяются
компонентами общего владельца. Они не становятся образцом для других экранов.
Существующий **нативный `UiSelect` и его API сохраняются**: новый `UiSelectMenu`
предоставляет отдельное управляемое меню выбора, не меняя семантику прежних
потребителей штатного `<select>`.

| Компонент | Публичная граница | Основа |
| --- | --- | --- |
| `UiPopover` | Управляемые open/onOpenChange и renderTrigger; содержимое не владеет бизнес-состоянием | Уже используемый `@floating-ui/react` |
| `UiSelectMenu` | Управляемые value, options, onValueChange и mode | Уже установленный Radix Select |

`UiPopover` предоставляет trigger через `renderTrigger`, чтобы потребитель
использовал общий `UiButton` без вложенных кнопок и ручного копирования его
оформления. Ширина trigger и формы не меняется при открытии, смене макета или
режима. Popover поддерживает наружный клик, Escape и возврат фокуса trigger.
Вложенный Select имеет собственный слой закрытия: первый Escape закрывает
только список и возвращает фокус Select trigger; родительский Popover остаётся
открытым. Следующий Escape может закрыть Popover.

Оба компонента оформляются scoped CSS Modules через семантические `--ui-*`.
Portals получают эффективную тему/палитру через общий `UiTheme` и runtime
context. Общий контекст portal container в UI-ките передаёт вложенному Select
контейнер Popover: вложенный список сохраняет корректную границу взаимодействия,
тему и фокус вместо локальной копии механизма порталов в preview. Контракт
закрытия учитывает вложенный portal, чтобы выбор пункта или Escape списка не
считались наружным действием для родителя.

`UiTemplateProvider` допускает обратно совместимое optional расширение для
контролируемого mode. Значение поступает от client controller; provider не
читает cookie/URL и не сохраняет preferences. Прежние потребители без нового
параметра сохраняют действующее поведение.

В `@realize/ui-kit` добавляется peer dependency `@radix-ui/react-select` с
существующим root constraint `^2.3.3`. Внешние зависимости не обновляются;
Floating UI и Radix не дублируются новым движком. Общий template protocol
не меняется. Единственное дополнительное расширение Button-контракта для
исправления от 2026-11-12 описано ниже; прочие primitive API не расширяются.

Это контракт исправления; успешность runtime-проверок должна подтверждаться
после реализации. Связанный сценарий и критерии —
[§3.11 Control Panel](../specifications/realize-ai-control-panel-first-release.md#311-исправление-preview-ui-и-реактивное-переключение).

### Геометрия dropdown и presentation-токены шаблона

Срез от 2026-11-12 приводит dropdown и Popover к Task Manager reference через
семантические токены, а не через локальные overrides preview. Публичные props
`UiPopover` и `UiSelectMenu` остаются прежними. `ControlPanelPalette` задаёт
представление нового шаблона, а общие primitives имеют fallback для остальных
потребителей. `UiTheme` передаёт эту palette и в portals. Legacy template,
нативный `UiSelect` и его потребители не изменяются.

| Токен | Значение Control Panel | Fallback общего primitive |
| --- | --- | --- |
| `--ui-popover-width` | 280px | 296px |
| `--ui-popover-body-padding` | 12px | `--ui-space-4` (16px) |
| `--ui-menu-radius` | `--ui-radius-md` (14px) | `--ui-radius-sm` (10px) |
| `--ui-menu-padding` | 5px | `--ui-space-1` (4px) |
| `--ui-menu-font-size` | 13px | 14px |
| `--ui-menu-font-weight` | 500 | 400 |
| `--ui-menu-line-height` | 18px | 21px |
| `--ui-menu-item-radius` | `--ui-radius-sm` (10px) | `calc(var(--ui-radius-sm) - var(--ui-space-1))` |
| `--ui-menu-item-padding-inline` | 9px | `--ui-space-3` (12px) для начала строки; `--ui-space-2` для индикатора |
| `--ui-menu-selected-background` | `color-mix(in srgb, var(--ui-color-primary) 9%, var(--ui-color-surface))` | transparent |

Пункт списка имеет minimum block-size 36px и не фиксируется по высоте при
длинном содержимом; на coarse pointer trigger и пункт имеют минимум 44px.
Selected использует primary text и 9% primary background, highlighted —
`surface-raised`; тема определяется semantic tokens. Радиус Popover наследует
`--ui-radius-md`.

`UI_FLOATING_GEOMETRY` у общего владельца задаёт указатель 20×12px, padding
указателя 20px, gap 6px и collision padding 8px. Select использует gap между
trigger и меню. Popover учитывает высоту указателя и gap при offset, применяет
flip/shift с collision padding. Middleware `size` ограничивает scroll body
фактически доступной высотой выбранной стороны через внутренний
`--ui-popover-available-height`, учитывая border 2px. Указатель остаётся вне
прокрутки и не обрезается.

Popover позиционируется fixed с `transform: false`. Его появление использует
только opacity за 160ms: transform родителя изменил бы систему координат
вложенного fixed Select. Select имеет отдельную scale-анимацию 0.97→1 при
открытии за 160ms и 1→0.97 при закрытии за 110ms. При reduced motion анимации
отключаются. Контракт вложенных portals, Escape и возврата фокуса сохраняется.

Browser-сверка от 2026-11-12 подтвердила dropdown на desktop 1440px в light/dark,
mobile 390px light и 320px dark: геометрию строк, selected/highlighted, тему
порталов и отсутствие горизонтального overflow. При 320×240px Popover
ограничен доступными 166px и прокручивает содержимое. Выбор макета/темы без
reload, вложенный Escape, возврат фокуса и наружный клик после History API
проверены отдельно. Evidence —
`.ai-workspace/tasks/2026-11-11-preview-controls-fix/logs/dropdown-reference-check.json`
и screenshots рядом. Полная приёмка остальных сценариев §3.11 этим не заменяется.

## Кнопки верхней панели и toolbar appearance

Исправление от 2026-11-12 разделяет обычную кнопку формы и компактное действие
верхней панели. Измеренный обычный UI-button 42px с font-size 14px не подходит
для toolbar внутри topbar 52px. Смена размера только локальным CSS preview
создала бы скрытый визуальный контракт; представление принадлежит шаблону.

`TemplateButtonProps` получает обратно совместимое optional поле
`appearance?: "default" | "toolbar"`. Отсутствие означает прежнее поведение.
`UiButtonPrimitive` потребляет это поле и выводит `data-ui-appearance`, не
передавая служебный prop как неизвестный атрибут DOM. Общий UI-kit задаёт
семантическую точку подключения; конкретное toolbar-представление предоставляет
новый package-owned `ControlPanelButton` через UI adapter пакета
`template-realizeai-control-panel`. Legacy `template-realize` и его кнопки
не изменяются.

Reference Task Manager задаёт следующие измеренные desktop-параметры для
текстового toolbar-действия:

| Параметр | Основа |
| --- | --- |
| Topbar | 52px |
| Высота действия | 36px; min-height 34px, фактически 20px line-height + 7px × 2 padding + 2px border |
| Текст | 12px / 600 |
| Скругление | 9px |
| Gap | 7px |
| Padding | 7px по вертикали, 10px по горизонтали |
| Touch target | Не менее 44px |

Нормальный `ghost` имеет прозрачную поверхность и muted text. Hover/open
используют `surface-raised` и основной text через semantic tokens; состояния
не меняют геометрию. Preview trigger использует общий `UiButton` с
`appearance="toolbar"`, `variant="ghost"` и иконкой 17px. Данные действий
и open-state принадлежат consumer/Popover, button adapter отвечает за их
отображение, focus и совместимость контракта.

`data-preview-canvas` обозначает стабильную внешнюю обёртку preview, сохраняемую
при смене renderer, mode и переходах History API. Граница dismiss не должна
зависеть от DOM-узла прежнего renderer: наружный клик по canvas после смены
макета или истории продолжает закрывать Popover. Вложенный Select по-прежнему
имеет собственный слой закрытия и portal container.

Это контракт текущего исправления. Предыдущие type/regression проверки не
доказывают правильность новой toolbar-геометрии: dark/mobile, hover/open,
наружный клик после смены renderer/history и focus должны быть подтверждены
отдельной браузерной проверкой.

## Шаблонные пакеты и границы

[ADR-0018](decisions/ADR-0018-self-contained-template-packages.md) и
[§11 Мастерской](../specifications/design-workshop.md#111-единый-контракт-самодостаточного-шаблона)
задают одну семью manifest/presentation/UI contracts для Admin/frontend.
Независимый от Payload/AI `@realize/template-contracts` предоставляет общий SDK;
его React presentation API имеет отдельный публичный entry `/react`.
`@realize/template-realize` — первая самостоятельная реализация, первоначально
только для Admin. Поддержка frontend target в SDK не означает наличие storefront
renderer или установленного управления выбором.

Действующий Admin renderer и его 60 связанных файлов перенесены одним владельцем
в `packages/template-realize/src/layouts/admin/`; копий в UI-kit нет.
Публичный `@realize/template-realize/admin` предоставляет renderer entry,
`@realize/template-realize/ui` — составные SystemAdmin components и их contracts.
Прямые потребители обновлены; обратного re-export из UI-kit нет.
Import graph односторонний:
UI-kit → Template SDK; Realize template → UI-kit/SDK; host → эти публичные exports.
Ни UI-kit, ни SDK не импортируют конкретный template или `@/` host alias.

Realize rail, flyout geometry, toolbar composition и breakpoints принадлежат
template package. Общие primitives/behavior не требуют его CSS. Пакет содержит
settings, palettes/assets и собственные primitive implementations; внутреннее
дерево другого поставщика свободно. Module body, запросы, DTO, команды и права
остаются у feature/host. Template renderer не хранит Task/Git-sync state.

Активный UI provider разрешает primitive slots по общему props/ref/events/
accessibility контракту. В первом срезе заменяются Button/Input; остальные
действующие controls используют **явно объявленное** наследование default UI.
Это ограниченный adapter, а не заявление о полной замене всех controls.
Default Button/Input foundation использует `:where(...)` для обычных базовых
и размерных правил: template/module classes сохраняют геометрию независимо
от порядка production CSS chunks. Focus/error/disabled и интерактивные состояния
остаются явными selectors; снижение приоритета base не отменяет эти состояния.
Default Tailwind/Payload resets имеют собственные layers, а standalone Admin
не импортирует их CSS.
При расширении контракта обязательные slots проверяются до activation.
Модуль не импортирует concrete template, и наличие своего Button в пакете
не считается интеграцией без перевода реальных consumers на adapter.

Package `0.1.0`, manifest protocol `1.0` и settings schema `1.0.0` обозначают
разные версии. Palette/mode/settings preset не является новым кодовым пакетом.
Appearance selection и settings revision принадлежат host; общий SDK проверяет
совместимость, UI runtime не читает cookies/БД и не запускает install/API.
Для нового compiled React-кода требуется штатный build/delivery; выбор между
совместимыми пакетами в текущей сборке может не требовать нового build.

React/Next SSR сохраняются: server snapshot сериализуем, callbacks строит client
host, данные/состояние/настройки обновляют Client Components реактивно.
Module controllers выше выбираемого renderer сохраняют drafts, frozen input/
revision и pending UUID/outcome. До обеспечения этого switch при dirty/pending
блокируется. Effective adapter/palette/mode должны доходить до portals;
смена mode сама по себе не меняет renderer.

Мастерская выпускает пакет по принятой revision, общий
[менеджер расширений](../specifications/extension-management.md) устанавливает
его. SDK/provider в исходниках не доказывают package export из Workshop,
каталог, install/update/replace, persistent activation и readiness рабочей сборки.

## Контракт

Ниже описаны общие компоненты и встроенное default оформление. Совместимый
template package может заменить их объявленные UI slots и палитру; фиксированный
фиолетовый/бирюзовый стиль не является обязательным для другого шаблона.

- Компоненты используют React/Radix и CSS Modules; внутри пакета нет Payload,
  Next, бизнес-данных, запросов или зависимости от CSS приложения.
- `UiTheme` задаёт семантические `--ui-*`: поверхности, текст, акценты, границы,
  свечение, отступы, радиусы и состояния. Цветовой акцент — фиолетовый/бирюзовый;
  светлая и тёмная темы сохраняют одну структуру и читаемый текст.
- `--ui-layout-gap` равен `--ui-space-4` (16px) и задаёт общий шаг сетки:
  расстояния между секциями страницы, колонками, карточками и вкладками.
  Внешнее поле страницы принадлежит shell; потребитель не добавляет его снова.
  Контролы, подписи и табличные ячейки используют собственные интервалы
  внутри блока. UiTabs и страницы системной оболочки используют общий шаг
  без локальных значений, отличающихся между экранами и темами.
- Payload bridge `AdminUiTheme` передаёт режим из Payload. Самостоятельный Admin
  host разрешает package/palette/mode отдельно; storefront использует свой target.
  Глобальные resets и CSS одного document не подключаются в другой.
- `UiButton`, `UiInput`, `UiTextarea`, `UiBadge`, `UiSurface`, `UiSwitch`, `UiNotice`, `UiTabs` владеют повторяемым оформлением
  и доступными состояниями. Вариант `UiSurface` `raised` выделяет вложенные
  логотипы и иконки; они сохраняют семантику содержимого, не становясь кнопками.
  `asChild` сохраняет семантику и навигацию внешней ссылки.
  Радиус карточки задаёт палитра через `--ui-surface-radius`. По умолчанию
  `UiSurface` использует `--ui-radius-lg`. Палитра Control Panel связывает
  радиус карточки с радиусом боковой панели.
  Вариант `appearance="flush"` встраивает поверхность без рамки, тени и
  скруглений, например внутри закреплённой панели чата.
- `UiResizeHandle` оформляет фокусируемый вертикальный край панели с семантикой
  separator и текущей шириной. Потребитель задаёт границы и обработчики
  перетаскивания/клавиатуры; примитив не хранит размеры и не меняет layout.
- `UiSwitch` сохраняет нативные свойства checkbox и семантику switch; имя
  задаётся через label или `aria-label`. `UiNotice` оформляет сообщение;
  роль `alert` или `status` назначает потребитель по сценарию.
- `UiTextarea` переиспользует оформление поля и нативные атрибуты/ref.
  Вариант `plain` встраивается в составной блок ввода без второй рамки.
  `UiTabs` связывает tab/tabpanel, поддерживает Arrow/Home/End и сохраняет
  скрытые панели, чтобы переключение вкладок не сбрасывало черновики.
- `getUiButtonClassName` разделяет оформление кнопки с нативными triggers
  внешних компонентов без вложенных buttons. Адаптер `AdminMenu` принадлежит
  Payload plugin: использует штатное меню Payload, сохраняет клавиатуру и фокус,
  подключает тему UI-кита внутри portal. Сам UI-кит не зависит от Payload.
- Вторичная кнопка `UiButton.secondary` использует мягкую заполненную
  поверхность, тонкую нейтральную границу и лёгкую тень. Hover и active добавляют
  оттенок основного акцента без изменения размеров; keyboard focus остаётся
  отдельным заметным кольцом. Общий вариант, включая «Настроить навигацию»,
  адаптируется к обеим темам через существующие семантические токены.
- `UiButton.disabledAppearance` по умолчанию `muted`: неактивная кнопка
  приглушается и теряет тень. Явный `preserved` сохраняет оформление выбранного
  variant для предпросмотра действия в референсе. Нативный disabled, запрещённый
  курсор и отсутствие hover/active сохраняются; остальные кнопки не меняются.
- Страница настроек интеграции группирует поля по ответственности, отдельно
  показывает сохранённое состояние и действия. Черновик формы не меняет
  сводку до сохранения. Оформление разделов не владеет запросами или валидацией.
- Каталог задаёт только композицию карточки и данные сервиса. Карточка квадратная:
  верхний ряд логотип/статус, самостоятельный текстовый блок и отдельная нижняя
  полоса перехода. Сетка использует один столбец на узком экране, сохраняя описание.
  Декоративное свечение не несёт смысла и не мешает чтению и focus.
  При hover интерактивная поверхность усиливает свечение и тень, сохраняя
  положение и размеры; текст и иконки действия также не смещаются.
- Новые общие варианты добавляются в UI-кит по реальным потребителям. Страница
  не создаёт локальный UI stack; собственные primitive implementations шаблона
  имеют package owner и подключаются через объявленный adapter contract.

## Расширение

`UiConfirmation` — общее управляемое подтверждение в компактной карточке
уведомления, поверх `UiDialog`. Desktop размещает её снизу справа; mobile
сохраняет карточку с отступами, не превращая в полноэкранную форму. Заголовок,
название объекта, короткое описание и две кнопки заменяют несколько секций.
Состояние блокировки показывает причину и одну кнопку «Понятно»; ошибка
остаётся рядом с действием. Pending блокирует повторное подтверждение и закрытие.
У карточки нет таймера; она не выполняет действие автоматически. Семантика
alertdialog, focus trap, начальный фокус на отмене, Escape и возврат фокуса
сохраняются. Тема, кнопки и ошибки принадлежат общим primitives; бизнес-права
и удаление остаются у потребителя.

`UiDialog` принимает `size="compact"`, `placement="notification"`,
`role="alertdialog"`, декоративный icon, initialFocusRef и hideCloseButton.
Обычные формы сохраняют прежнюю компоновку. Использование компактного варианта
само по себе не меняет lifecycle или разрешения действия.

[Системный шаблон админки](system-admin-shell.md) переносит concrete shell в
Realize template package; UI-kit сохраняет dialog/portal и общие primitives.
Task manager — первый потребитель; host-specific авторизация и маршрутизация
остаются за пределами пакета. Portal получает effective adapter и тему,
ширина UiTheme
не определяет ширину диалогового Content. Состояния normal/hover/focus
сохраняют внутренние отступы и геометрию текстовых действий.

`SystemAdminToolbar` и `SystemAdminBreadcrumbs` принадлежат Realize Admin template owner.
Toolbar объединяет поиск/команды, меню создания, ИИ-вход, уведомления и профиль;
доступные данные и callbacks передаёт host. Generic action-menu использует текущие
Radix content/стрелку/стили и согласует закрытие меню с открытием следующего dialog.
Крошки показывают текущую страницу текстом и сворачивают средние уровни в меню.
Уровни разделяются точками; back следует после пути. Общий main имеет внутреннее
поле перед scrollbar. `SystemAdminProfileMenu` использует тот же Radix menu lifecycle,
группирует аккаунт, баланс и отдельный выход; тема, язык и справка оформлены
компактными иконками. Billing/auth callbacks и availability остаются у host.
Optional toolbar.onCreate открывает полную форму host вместо dropdown.
Контролируемый locale ru/en переводит собственные элементы каркаса; хранение
предпочтения и доменные переводы остаются у host. `UiBadge.accent` выбирает одну
из шести общих тематических красок без локальных копий badge styles.
`SystemAdminBreadcrumbMenu` добавляет поиск по соседям уровня и текущий выбор;
`currentAsHeading` убирает повторение h1, `contentActions` завершает строку страницы.
`UiEntityMark` — общий компактный знак объекта с иконкой или пользовательской
картинкой и fallback. Его палитра соответствует `UiBadge.accent`.
Подробный контракт — в [системном шаблоне](system-admin-shell.md).

`SystemAdminNavigation` экспортируется из template package отдельно от полной оболочки: Realize rail
с Lucide-иконками, отложенным hover, боковым меню, клавиатурой и мобильным
представлением. Семантические navigation-токены `UiTheme` задают отдельный
тёмный фон и неоновый акцент панели в обеих темах, не меняя цвета остальных
элементов админки. Host передаёт registry разделов, активный пункт, тему и
содержимое меню. Наведение не выполняет переход. Будущий адаптер Payload Nav
может использовать этот owner без вложения второй оболочки/шапки; права и
состав доступных разделов остаются ответственностью host.

`SystemAdminNavigationPreferences` задаёт порядок и скрытые id. Меню «Ещё» и
редактор видимости/сортировки принадлежат той же навигации; `hiddenByDefault`
задаётся в registry. Host передаёт preferences и callback сохранения, UI-kit
не обращается к browser storage и не расширяет права на доступные разделы.

Существующий `src/components/ui` пока обслуживает storefront. При переносе его
компонента общий владелец выбирается в UI-ките, прямые потребители обновляются,
а заменённая реализация удаляется. Полная миграция storefront в этот этап не входит.

Проверки визуальных изменений: реальная страница, светлая/тёмная тема,
мобильная ширина, клавиатура, computed CSS и адресные проверки исходников.

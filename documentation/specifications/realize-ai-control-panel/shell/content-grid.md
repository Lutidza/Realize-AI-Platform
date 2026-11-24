# Сетка содержимого RealizeAI Control Panel

<a id="content-grid"></a>

## Внутренняя сетка содержимого

**Реализовано и проверено 2026-11-12.** За второй уровень компоновки
Control Panel отвечают общие примитивы UI-кита `UiContainer`, `UiGrid` и
`UiGridItem`. Контейнеры, колонки и интервалы следуют подходу Bootstrap,
Grid, Flex и запросы к ширине контейнера — подходу Tailwind. Для реализации
этой сетки проект обошёлся без установки Bootstrap и Ant Design.
[Уровни компоновки и архитектурные основания](../../realize-ai-control-panel-first-release.md#32-макет-внутри-шаблона-и-система-компоновки) · [Контракт примитивов UI-кита](../../../architecture/ui-kit.md#сетка-содержимого-и-контейнеры).

### Контейнеры, колонки и интервалы

`UiContainer` предоставляет `fluid`, `contained`, `reading`; все варианты имеют
inline-size 100%, min-inline-size 0 и margin-inline auto, без дополнительного
padding поверх shell. `fluid` занимает доступную ширину. **Defaults данного
среза** — contained максимум 80rem и reading максимум 72ch, задаваемые токенами
`--ui-container-contained-max` и `--ui-container-reading-max` в палитре Control
Panel и fallback общего primitive. 72ch зависит от метрик шрифта; 80rem не
является фиксированной шириной каждого экрана.

`UiGrid` задаёт 12 колонок `repeat(12, minmax(0, 1fr))`. Горизонтальный и
вертикальный gutters независимы: `--ui-grid-column-gap` и `--ui-grid-row-gap`,
оба по умолчанию `var(--ui-space-4)` (16px). `UiGrid.style` принимает
экспортируемый `UiGridStyle`: `CSSProperties` с optional строковыми
`--ui-grid-column-gap` / `--ui-grid-row-gap`. Экран независимо задаёт запрошенные
gutters этими variables через общие spacing-токены или CSS-длины. Прямой inline
`columnGap` не используется, поскольку обходит защиту общего CSS. Новые поля
настроек шаблона или дублирующие gap-props для этого не создаются.

Column gutter вычисляется как `min(requestedGap, calc(100% / 12))`, где
requestedGap — `--ui-grid-column-gap` либо fallback `--ui-space-4`. При достаточной
ширине запрошенные 16px/24px сохраняются; в узком слоте верхний предел оставляет
неотрицательную доступную ширину для всех 12 треков. Row gutter сохраняет своё
независимое значение. Browser-проверка до исправления выявила overflow при
viewport 320px: вложенная сетка 228px имела 11 gutters по 24px (264px).
Новый предел в таком слоте — 19px; исправление внесено в общий primitive,
а demo использует variables, чтобы не обходить его inline `columnGap`.

### Адаптивные spans и вложенные сетки

`UiGridItem.span` принимает число 1…12 или объект `{ base?, md?, lg? }` с такими
же значениями. Default — все 12 колонок. Пропущенный base означает 12, md
наследует base, lg — md. Например, `{ base: 12, md: 6, lg: 4 }` даёт три
возможных раскладки карточек по доступной ширине. Внутренние CSS variables
base/md/lg задаются заново на каждом item; вложенный item без span не наследует
ширину внешнего элемента.

**CSS-only thresholds данного среза:** md от 48rem и lg от 64rem по ширине
ближайшего именованного inline-size container `UiGrid`. Это не viewport
breakpoints: вложенная сетка измеряет собственную ширину. Значения определены
только в CSS, без React hooks/JS-копии и hydration-перекомпоновки. Порог
перестроения самого shell **≤1024px остаётся прежним** и не связывается с
названиями md/lg внутренней сетки.

Компоненты сохраняют нативные div props/ref и `style` (у UiGrid — типизированный
`UiGridStyle`), работают как pure React
без Next/Payload, hooks, новых зависимостей или расширения UI adapter.
Параметры относятся к программной композиции экрана. Это **не блоки схемы
будущего редактора, не новые коллекции и не новые persisted settings**.

### Предпросмотр в обоих макетах

`ControlPanelGridPreview` в route `/reference/control-panel` передаётся как
содержимое renderer только host-ом preview. Он показывает 12 треков, три
responsive-карточки, вложенную сетку с собственными порогами и независимыми
row/column gutters, default span 12 и варианты contained/reading. Template
renderer остаётся независимым от demo; fixtures не переносятся в пакет шаблона
и не имитируют рабочие данные. В `without-topbar` только preview-композиция
резервирует сверху место для внешних controls; header в макет не возвращается.

### Критерии приёмки

- 12 колонок, spans и gutters имеют одного общего владельца, локальное demo
  содержит только композицию и подписи;
- base/md/lg переключаются по фактической ширине ближайшего UiGrid, вложенная
  сетка не использует viewport или ширину внешнего grid;
- пропуски breakpoint наследуют предыдущий span, каждый item сбрасывает
  внутренние variables, default span остаётся 12 на всех уровнях;
- fluid/contained/reading соблюдают доступную ширину и max-ограничения без
  двойного padding; row/column gutters задаются независимо через variables,
  horizontal gap ограничивается в узких слотах и не создаёт overflow;
- оба макета и light/dark сохраняют геометрию shell/footer, в том числе у
  границы 1024/1025px, содержимое не создаёт глобального overflow;
- route содержит только проверочные fixtures, template renderer не зависит
  от preview, настройки и рабочие assignments не меняются.

### Проверка 12 ноября 2026 года

В браузере проверили 14 сценариев на ширинах
320/390/768/1024/1025/1280/1440/1920px, включая оба макета и light/dark.
Подтверждены 12 треков, адаптивные spans по ближайшему контейнеру, независимые
gutters, default span 12 во вложении, отсутствие локального/глобального
горизонтального overflow и центрирование/max-width контейнеров. На 1920px
contained ограничен 1280px; на 320px вложенная сетка 228px имеет gutter 19px.
На границе 1024/1025px меняется shell, а grid следует доступной ширине.
У `without-topbar` main получает дополнительные 52px; footer остаётся 36px.
Прокрутка main не двигает footer/sidebar/document. Выбор макета с наполненной
сеткой сохраняет document, наружный клик закрывает Popover. Browser console
без ошибок; typecheck, адресный ESLint, 10 шапок и 68 regression tests прошли.

[Отчёт с замерами](../../../../.ai-workspace/tasks/2026-11-11-control-panel-first-slice/logs/content-grid-runtime.json) · [Скриншоты проверки](../../../../.ai-workspace/tasks/2026-11-11-control-panel-first-slice/screenshots/content-grid/).

На дату этой проверки production-сборка и доставка, подключение через штатные
настройки оформления и интеграция редактора оставались следующими шагами.

<a id="document-screen-geometry"></a>

## Общая геометрия экранов документов

Список, форма создания и экран чтения используют общий внешний
`UiContainer variant="fluid"`. При переходе между ними поверхности занимают
всю доступную ширину внутри одинаковых отступов `panel-content`. Заголовок
формы и ссылка «Все документы» начинаются у левого края соответствующей
поверхности. Внутри поверхности статьи текст выровнен по левому краю и
ограничен токеном `--ui-container-reading-max` (в палитре Control Panel — `72ch`).
В макете `without-topbar` у всех трёх экранов предусмотрено место над
содержимым для кнопки предпросмотра. Эти правила действуют на десктопе и мобильном.
[Общий контейнер экранов](../../../../src/components/admin/documents/DocumentScreenContainer.component.tsx).

24 ноября 2026 года в Chromium границы поверхностей совпали у всех трёх
экранов в обоих макетах. При ширине окна 1920, 1440, 1024 и 390 px поверхности
заняли соответственно 1508, 1028, 966 и 332 px. На этих ширинах кнопка
предпросмотра оставалась доступной, горизонтального переполнения не было.
[Замеры списка, формы и статьи](../../../../.ai-workspace/tasks/2026-11-11-control-panel-first-slice/logs/documents-frame-20261124/candidate-5b1b5cba542a99ad-result.json).

# RealizeAI Control Panel

Версия документа: **0.8**, 2026-11-18.

Исходный preview отдельного шаблона `realizeai-control-panel@0.1.0`.
Legacy `@realize/template-realize` не является зависимостью пакета.

- `/manifest` — сериализуемый паспорт без React/CSS.
- `/admin` — compiled definition и макеты с независимыми областями.
- `/settings` — server-safe validator настроек без React/CSS импорта; используется host каталогом.
- `/registry` — server-safe заявление логического владельца пакета; host проверяет его в общем owner registry.
- `/layouts` — metadata двух draft layout definitions `0.1.0` и exact pins текущего template release, без React/CSS/Node crypto.
- `/package.json` — metadata поставки для сверки выбранной версии и публичных exports.
- `settings.schema.json` генерируется командой `npm run generate:settings-schema --workspace @realize/template-realizeai-control-panel`.

Preview: `/reference/control-panel`, тёмная тема: `?mode=dark`.
Макет без верхней панели: `?layout=without-topbar`. Внешняя фиксированная панель
«Предпросмотр» использует общий `UiPopover`, `UiSelectMenu` и template-owned
toolbar presentation кнопки. Выбор макета и темы применяется сразу через client
controller и History API без отправки формы или перезагрузки document.
`pushState` меняет URL, `popstate` восстанавливает back/forward; явный reload
читает выбор из URL. «По умолчанию» убирает параметр layout;
`layout=default` — явный выбор. Cookie и рабочие настройки не сохраняются.

Это публичный preview каркаса без данных пользователей. Назначение оформления,
БД и рабочее назначение не меняются; сам public preview не подтверждает runtime installation. Первоначальный manifest поддерживает
только `admin/workspace`, настройки `density`, `panelWidth`, optional
`layoutId: default | without-topbar`.
Без layoutId сохраняется наследование. Оба макета используют общий frame; в `without-topbar` header отсутствует.
Поддержка auth/status — следующие шаги. Навигация/topbar content/mobile drawer
подключаются отдельно. Пустые области макета сохраняют согласованную геометрию.

Внутренняя сетка содержимого использует общие `UiContainer`, `UiGrid`,
`UiGridItem` из UI-кита. Defaults текущего среза: 12 колонок, gutters 16px,
contained максимум 80rem, reading максимум 72ch, fluid без max-ограничения.
`UiGridStyle` расширяет CSSProperties optional строковыми
`--ui-grid-column-gap` / `--ui-grid-row-gap`: gutters задаются этими variables
в `style`, а не прямым `columnGap`/`rowGap`. Column gutter ограничен
`min(requestedGap, 100% / 12)` для очень узких слотов, сохраняя 12 треков;
при достаточной ширине выбранные 16px/24px не меняются, row gutter независим.
Контейнеры не добавляют padding поверх shell. Spans — 1…12 либо `{ base, md, lg }`;
пропуски наследуют предыдущее значение, default span — 12. CSS container queries
md48rem/lg64rem измеряют ближайший UiGrid, не viewport. Viewport boundary shell
остаётся ≤1024px.

Route preview передаёт локальный `ControlPanelGridPreview`: три responsive
карточки, вложенную сетку с независимыми gutters и width modes. Demo не входит
в renderer пакета, не является схемой будущего редактора и не добавляет
persisted settings или зависимости. В `without-topbar` demo оставляет место
внешним controls; сам макет не получает header. Проверены 14 browser-сценариев
на восьми ширинах 320…1920px, оба макета и light/dark; overflow отсутствует,
footer/sidebar сохраняются при прокрутке main. Typecheck, адресный ESLint,
шапки и 68 regression tests прошли. Эти результаты относятся к public preview,
а не к server readiness gates следующего среза.

Штатные настройки оформления подключают пакет через host registration
`readiness: "preview-only"`: разрешены settings/prepare и защищённый actor-bound
preview, но не применение или использование как рабочий current/bootstrap и не
активация пакетной оболочки. Readiness — политика host, не свойство manifest и
не настройка пользователя. Без поля legacy-регистрации остаются ready.
Inventory select отключён с причиной preview_only; прочие gates сохраняются.
Общий optional enum «По умолчанию» удаляет layoutId из settings, сохраняя
наследование. В БД readiness не сохраняется; нового installer, миграций и
автосмены assignments нет. Доступный preview-only пакет показывается как
«Для предпросмотра», в том числе при неподтверждённом runtime.

Dev-приёмка 2026-11-13 на `/system/appearance` (`127.0.0.1:3001`) с admin
session подтвердила layout inheritance, оба actor-bound макета, light→dark с
сохранением текста, локальную форму и panelWidth240/compact. На desktop1440
sidebar240px, mobile390light без overflow; прямой apply отклонён ожидаемым
409 TEMPLATE_PREVIEW_ONLY. Рабочие targets/apply history до и после совпали.
Для dev нужен `PAYLOAD_PUBLIC_SITE_URL=http://127.0.0.1:3001`, без ослабления
Payload session/ACL/origin-защиты. Основная служба3000 не обновлялась,
installed inventory dev остаётся unverified. Это приёмка защищённого preview,
не активации или production installer. Финальные 16 Vitest suites/317 tests,
полный typecheck и адресный ESLint прошли. Временный admin удалён после logout,
fixture credentials/source очищены; защищённый каталог без сессии вернул 401.
Evidence:
`.ai-workspace/tasks/2026-11-11-control-panel-first-slice/logs/appearance-runtime.json`.

Owner registration не меняет template manifest, версии макетов или readiness.
Её identity отличается от template ID и npm name; корневого владельца подтверждает
host. Первый срез и проверки —
[в отчёте от 17 ноября](../../documentation/reports/2026-11-17-element-owner-registry-first-slice.md).

## Макеты и самостоятельные версии

Оба определения имеют namespace `realize`: `realizeai-control-panel.layout-default`
и `realizeai-control-panel.layout-without-topbar`, каждое с собственной явно
назначенной draft version `0.1.0`. Это первая декларация, не ретроспективная
публикация прежних макетов. Владелец — package identity из `/registry`,
принадлежность template задаётся отдельной identity без привязки к каждому
новому package release. Поставка реализации остаётся частью template package.

`controlPanelLayouts.metadata.ts` — единый authored источник описаний, labels,
local aliases и release pins. IDs/settings enum/host mappings выводятся из него.
Pins версии определения задаются явно: при новой definition version нельзя
незаметно перенаправить alias старого опубликованного выпуска шаблона.
Отсутствие settings.layoutId наследует default; явный `default` остаётся явным
выбором, `null` недопустим. Результат разрешения не записывает effective default
обратно в settings.

`default` содержит rail/topbar/sidebar/panel-content/footer. `without-topbar`
не содержит topbar и отклоняет переданное туда содержимое. Brand остаётся
вложенным slot rail; React prop content соответствует slot panel-content.
Все имеющиеся области сохраняются пустыми. Responsive видимость принадлежит
CSS; metadata не объявляют реализованным мобильный drawer или редактор компонентов.

Основной renderer использует один тип ControlPanelFrame для обоих вариантов.
При смене layoutId сохраняются экземпляр content, локальный React state и DOM
общих областей. Неподдержанный topbar/context отклоняется до rendering, без
молчаливого удаления или переноса. Public wrappers прежних макетов сохранены
для прямого использования; гарантия live switching относится к общему Renderer.

Общая геометрия остаётся в Frame/CSS/palette. Изменение публичных областей,
breakpoint, empty/scroll policy или согласованной геометрии требует проверки
совместимости и соответствующей layout version, даже при прежнем JSON.
Исправление реализации внутри прежнего контракта может ограничиваться новым
package release. Подробные guides и состояние экземпляров не копируются в descriptor.

Серверный `@realize/template-contracts/layouts/server` строит отдельный
SHA-256 catalog snapshot; необязательный expectedCatalogHash должен происходить
из ранее принятого снимка. Browser parser проверяет структуру и формат hash,
не подтверждая SHA-256. Hash покрывает metadata, template version и alias pins,
не bytes renderer, guide text или artifact digest. Owner snapshot hash не
заменяет layout catalog hash. Рабочая активация сохраняет `preview-only` gate.

Второй source-срез от 18 ноября подключает этот catalog к host registration
Extension Manager. Pure prepare фиксирует exact layout reference и catalog hash,
сохраняя наследование settings.layoutId. Durable prepare/apply остаются закрыты
политикой `layoutAssignmentWrites: "disabled"`: попытка записать новый binding
возвращает `LAYOUT_BINDING_WRITES_DISABLED`, а legacy flows продолжают работать.
Новых записей/назначений и обновления службы этот source-срез не выполняет.

См. [спецификацию](../../documentation/specifications/realize-ai-control-panel-first-release.md).

# Realize-AI One — первый релиз и переход с Realize

Версия документа: **0.1**, 2026-10-19. Статус: **Target specification**.
Источник: TASK-23 / ONE-04 в составе TASK-9. Это состав будущей поставки;
пакет One и описанный переход ещё не реализованы и не активированы.

## 1. Результат первого релиза

**Realize-AI One** — первый стандартный шаблон платформы с качественной
оболочкой, общими элементами, собственными auth/status композициями и интерфейсом
управления оформлением. Визуальная основа — референс Task Manager; его demo store
и бизнес-логика не входят в шаблон.

Одно назначение действует на всю область Admin, независимо от роли и набора
подключённых модулей; отдельное назначение действует на сайт. Новые разрешённые
collection/global/custom/module screens получают оформление через общий host,
без изменения пакета ради каждого URL. Состав навигации определяется доступными
модулями и правами. Матрица экранов — проверка покрытия, не allowlist шаблона.

Принятые границы заданы [ADR-0018](../architecture/decisions/ADR-0018-self-contained-template-packages.md)
и [§11 Мастерской](design-workshop.md#11-темы-компоненты-и-качество).
Этот документ определяет состав первого One и порядок перехода, не создаёт
вторую систему SDK, установки или управления задачами.

Основания по фактическому состоянию:
[ONE-01 — карта покрытия](../reports/2026-10-19-template-coverage-audit.md),
[ONE-02 — работа переключателя](../reports/2026-10-19-template-switching-browser-audit.md),
[ONE-03 — разбор референса](../reports/2026-10-19-realize-one-reference-breakdown.md).

## 2. Имя и версии

| Поле                     | Текущая установка            | Первый One                                                       |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------- |
| Display name             | `Realize`                    | `Realize-AI One`                                                 |
| Template ID              | `realize`                    | `realize` — сохраняется семейство                                |
| Package                  | `@realize/template-realize`  | Тот же package owner                                             |
| Package/template version | `0.1.0`                      | **Плановая `0.2.0`**                                             |
| Развиваемый source owner | `packages/template-realize`  | Тот же каталог; отдельный развиваемый fork One не создаётся      |
| Targets                  | Только `admin`               | `admin` и `frontend`, с отдельными assignments                   |
| Старый выпуск            | Текущая workspace definition | Неизменяемый versioned артефакт `0.1.0` для reference и перехода |

Новая версия отражает изменение состава и контрактов первого продукта.
Название One не требует нового template ID. `1.0.0` не используется как обещание
стабильности до соответствующей приёмки; alpha/beta suffix текущая schema не поддерживает.
Версии manifest protocol, SDK/UI contract, settings schema и palette независимы
от package version. Их изменения определяют TASK-25/26/30/31 по реальному diff.
Существующие palette ID/settings не переименовываются автоматически; прежние
manifest и palette версии не переписываются под новый внешний вид.

**До изменения существующего пакета требуется настоящий baseline `0.1.0`.**
Сейчас registry содержит один импорт текущей workspace definition; готового
подключения двух выпусков нет. TASK-30 должен сначала закрепить воспроизводимый
артефакт прежнего выпуска: manifest, renderer, `/ui`, settings validator/schema,
palettes, CSS/assets и совместимые точные зависимости. Reference imports и
необходимая ему цепочка UI/provider также должны разрешаться в прежний baseline.
Одна запись `0.1.0`, указывающая на код `0.2.0`, недопустима.

Способ хранения и подключения артефакта определяется в TASK-30 через существующий
delivery owner; отдельный installer/engine ради One не создаётся. Готовность
доказывается реальными imports обеих версий, сборкой, изоляцией CSS и browser
сравнением reference. Архив прежнего выпуска не становится вторым редактируемым
источником разработки. Пока baseline не обеспечен, изменение его identity/кода
и активация One не проходят этот gate; остальные независимые работы продолжаются.

## 3. Что входит

| Блок                       | Первый релиз                                                                                                    | Основа и объём доработки                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Визуальная система         | Semantic tokens, light/dark, typography, spacing/density, radii, focus/motion, состояния                        | Развить существующие UI-kit и palette owners; закрепить наследование и обязательные primitive slots                              |
| Каркас Admin               | Rail, sidebar, header, content frame, footer, независимые scroll области, mobile drawer                         | Переиспользовать `SystemAdminShell`; дополнить варианты пустой/длинной/динамической навигации                                    |
| Верхняя панель             | Контекст, поиск/команды, создание, assistant entry, уведомления, профиль/preferences — при доступной capability | Общие элементы готовы; реальные данные/actions подключает host. Demo inbox/billing/actors не становятся платформенными сервисами |
| Контекст страницы          | Breadcrumbs, heading, badge, назад, основные действия                                                           | Довести нейтральный presentation contract, включая responsive действия; не копировать task-specific CSS в страницы               |
| Контент и footer           | Единый frame и общий footer slot; доступные состояния, длинный текст, dialogs/menus/portals                     | Содержимое и сообщения предоставляет модуль; «ТЗ 0.9» и demo notice не переносятся в рабочую оболочку                            |
| Auth                       | Вход и выход, восстановление доступа, регистрация пользователя, bootstrap первого администратора                | Использовать существующие формы/API/политику; создать композиции One для соответствующих targets                                 |
| Status/recovery            | Loading, empty, error, 404, forbidden и безопасное восстановление оформления                                    | Общие presentation components и независимый доступ к recovery при ошибке активного renderer                                      |
| Управление оформлением     | Установленные версии, независимый выбор Admin/сайта, palette/mode/settings, preview, apply, history и recover   | Использовать существующий ExtensionManager lifecycle; обеспечить понятные unavailable/conflict/pending состояния                 |
| Глобальный Admin host      | System Admin, native редакторы, media, AI/MCP/Usage, динамические views и overlays                              | Адаптировать оформление и UI contracts; сохранить schemas/controllers/commands/ACL и существующие бизнес-возможности             |
| Frontend One               | Самостоятельный renderer, общие Header/main/Footer, auth/status и primitives для существующего сайта            | Подключить CMS pages, каталог/товар, cart/checkout/account и overlays к общему назначению, сохранив контент и поведение          |
| Реактивность               | Обновление разрешённого назначения, настроек и данных без потери состояния                                      | Controllers живут выше сменного renderer; SSR, hydration и portals получают согласованное оформление                             |
| Переносимость и AI-процесс | Одна система контрактов/стека, workflow и skills до реализации, воспроизводимая приёмка                         | Использовать существующие SDK/UI/template owners, правила и delivery, без параллельной библиотеки                                |

Общие элементы topbar входят в шаблон как capability-driven components. Первый
релиз не требует создания отсутствующих backend-поиска, inbox или финансового
сервиса ради заполнения панели: host передаёт реальные возможности, а недоступные
действия не имитируются. Наличие search trigger или demo notification в reference
не подтверждает платформенную интеграцию.

Применение One к сложному бизнес-экрану включает его общий chrome, используемые
primitives, tokens и overlays. Таблицы, редакторы и формы сохраняют предметную
композицию и возможности; их полный продуктовый редизайн не является условием.
Экран со старой независимой темой внутри новой рамки не считается подключённым.
Внешние payment widgets используют поддерживаемый provider appearance API;
ограничения внешнего UI фиксируются в проверке, без изменения платёжной логики.

## 4. Auth и полномочия

Template оформляет разрешённый host-сценарий, а не создаёт новую модель доступа.
В инициализированной установке обычная регистрация создаёт `customer`; доступ
в Admin требует роли `admin`. Назначение ролей сохраняет серверную проверку.
При пустой Users применяется существующий bootstrap первого пользователя.

Оформляются действующие процессы `/login`, `/create-account`, восстановления
пароля и Payload login/create-first-user/unauthorized в пределах владельца target.
Маршруты и redirects уточняет TASK-25/39/40; не требуется выдумывать общий
`/admin/register`. После bootstrap обычная публичная регистрация не выдаёт
права администратора; существующее исключение первой Users-записи сохраняется.
Приглашения, заявки на доступ и новые правила выдачи ролей не входят в этот релиз.

При выборе native Admin его доступность и возврат определяет host policy;
One не создаёт копию Payload и не назначает ему фиктивный manifest.
Выключение native auth допустимо только после проверки самостоятельных auth/status
процессов и восстановления. Payload backend, session и ACL сохраняются.

Источники: [Users](../../src/collections/Users/index.ts),
[bootstrap hook](../../src/collections/Users/hooks/ensureFirstUserIsAdmin.ts),
[CreateAccountForm](../../src/components/forms/CreateAccountForm/index.tsx),
[System Admin policy](../architecture/system-admin-shell.md#штатный-и-пакетный-интерфейсы-admin).

## 5. Владельцы и сохранность состояния

| Владелец                                | Ответственность в переходе                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/template-contracts`           | Manifest/compatibility, public presentation и UI adapter contracts                                  |
| `packages/ui-kit`                       | Общий foundation/runtime и явно наследуемые defaults; без импорта concrete template                 |
| `packages/template-realize`             | One renderer для двух targets, layout, palette/settings/assets и собственные реализации             |
| Host и adapters в `src` / plugin owners | Routes, session/ACL, dynamic navigation/capabilities, global assignment resolution и безопасные DTO |
| Business modules                        | Controllers, данные, формы, submit, draft, revision, pending UUID и outcome                         |
| `packages/payload-extension-manager`    | Каталог, подготовка/применение, revisions/CAS, immutable receipts, recovery                         |
| `.ai` / `.codex`                        | Workflow, правила/checks и их Codex adapters; не копия продуктового SDK                             |

Установка, активация template, выбор native/template и личный mode различаются
в контракте и UI. TASK-25/27 фиксируют effective precedence и обновление открытых
вкладок; существующие настройки и preferences не сбрасываются молча.
Изменение Admin не меняет frontend assignment, и наоборот.

Смена renderer сохраняет draft, frozen input/revision, pending UUID и known/unknown
outcome. До доказанной сохранности dirty/pending смена блокируется с объяснением;
reload не считается заменой этой границы. Неизвестный исход сначала сверяется
повтором прежней команды, а не новым UUID. Контроллеры всех затронутых модулей,
включая Workshop и appearance manager, входят в эту проверку.

## 6. Последовательность реализации

Номера ниже — существующие карточки; новые дубли не создаются. Порядок определяется
зависимостями и gates, а не только числом TASK.

| Шаг                             | Карточки                                       | Результат перед переходом дальше                                                                          |
| ------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1. Контракты                    | TASK-24…27                                     | Стек, host/screens, styles/slots и lifecycle/UI; критерии global coverage и baseline совместимости        |
| 2. AI-инструкции                | TASK-28/29                                     | Workflow/skills/checks поддерживают тот же стек и границы до начала реализации                            |
| 3. Зафиксировать основу         | TASK-30, затем TASK-31…33                      | Настоящий baseline 0.1.0, SDK/пакет One, tokens, primitives, dialogs и общие состояния                    |
| 4. Проверить трудную интеграцию | TASK-44, до массового подключения native views | Ограниченный native-adapter spike на реальных сложных формах и динамическом view; критерии ниже           |
| 5. Host и оболочка              | TASK-34…38                                     | Реактивная общая граница, navigation/header/content/footer и сохранность controllers; выводы spike учтены |
| 6. Auth и управление            | TASK-39…42                                     | Действующие auth-процессы и интерфейс назначения с preview/apply/recover                                  |
| 7. Подключить потребителей      | TASK-43/45/46, затем TASK-47/48                | System Admin, native/plugin views и отдельный frontend renderer; существующий функционал сохранён         |
| 8. Общие ошибки и приёмка       | TASK-49…51                                     | Status/recovery, регрессия global switch, доступность, reference comparison и переносимость               |

TASK-44 выполняется после TASK-25/30/33 как ранняя проверка перед TASK-34;
полноценный reactive host не требуется для её ограниченного проверочного adapter.
Массовое применение результата остаётся TASK-45 после TASK-43/44. Зависимости
этих карточек синхронизируются с данным порядком; коды ONE сохраняют identity.
Если spike выявляет необходимость
расширить контракт, уточняются его существующие owners перед переносом consumers.
Срыв gate не разрешает сокращать глобальный охват до удобных экранов.

## 7. Переход установки и данных

1. **До смены build** сохранить действующие assignments/settings, history,
   reference baseline и точные версии. Подтвердить исход незавершённых команд;
   неизвестный outcome не теряет UUID при обновлении UI.
2. **Переходная сборка** содержит реальные `realize@0.1.0` и `realize@0.2.0`
   в согласованных server/client registries. До явного применения назначения
   старый вариант остаётся рабочим; default/fallback не переключаются автоматически.
   Выполнение этого пункта ещё не является полным installer нового кода.
3. **Reference** продолжает использовать прежний exact выпуск и preset.
   Проверяются прямые `/ui` imports, общие tokens/CSS и зависимости; одного
   сохранённого `templateVersion` недостаточно. Пересмотр самого образца — отдельная работа.
4. **Новый Admin candidate** создаётся штатным prepare с новой точной версией.
   Совместимые `density/panelWidth/mode` сохраняются после валидации; несовместимые
   настройки требуют явного решения в preview, без тихой подстановки defaults.
   Apply с expected revision добавляет receipt и переносит прежний current в previous.
5. **Frontend candidate** готовится и принимается отдельно. Исходное `null`
   не превращается в активный One вследствие Admin apply. До первого frontend
   назначения проверяется возврат к исходной storefront-конфигурации; нынешний
   recover требует non-null previous и этот сценарий пока не обеспечивает.
   Нужный initial-assignment recovery contract входит в TASK-27/42/48/49.
6. **История остаётся неизменной.** Не переписываются старые manifestHash,
   assignments и receipts массовым SQL. Новая сборка/catalog может сделать
   неприменённый старый plan неактуальным: после установленного исхода прежней
   операции готовится новый план, ledger сохраняется.
7. **Проверить возврат до активации для эксплуатации.** Recover Admin должен
   разрешать прежние exact version/settings/hash; переходная сборка остаётся
   доступной. Перед откатом на старый build назначение возвращается к поддерживаемой
   им версии. Ошибка renderer не должна закрывать доступ к recovery.
8. **После приёмки** отдельно обновить defaults новых установок. Старый артефакт
   нельзя удалить, пока он нужен reference, действующим назначениям или обещанному
   recovery. Недоступная версия показывается unavailable, а не как новый код под старым ID.

Установка и activation — отдельные действия; сам документ не разрешает commit,
push, миграцию или deployment. Их порядок принадлежит существующей доставке.
Источники lifecycle: [Extension Manager](extension-management.md),
[точный recover](../../packages/payload-extension-manager/src/appearance/prepareExtensionAppearance.service.ts),
[registry](../../src/components/admin/system-shell/systemAdminTemplates.registry.ts).

## 8. Условия готовности

| Gate                 | Обязательное подтверждение                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Настоящие версии     | Оба renderer реально собраны; old assignment разрешается без fallback; reference и старые receipts сохранены; установленная версия подтверждена runtime                                                                     |
| Native adapter       | Collection list/editor, global form, validation/save, relationships/upload drawers, drafts/versions/ACL, plugin view/portal; новая fixture schema/view без правки template. Vendor/generated файлы не редактируются вручную |
| Global coverage      | Direct URL, переходы, reload, открытые вкладки и динамический состав модулей; одна область Admin и независимая область сайта, включая auth/status/overlays                                                                  |
| State/lifecycle      | Реальная смена renderer при clean/dirty/pending, точный retry, конфликт revision, ошибка и recovery; никакой потери draft или повторной бизнес-команды                                                                      |
| Два targets          | Admin/frontend изменяются независимо; первый frontend apply имеет проверенный путь возврата при исходном null                                                                                                               |
| Визуальная система   | Реальные формы/таблицы/menus/dialogs, длинный русский текст, light/dark и 1440/768/390; tokens и palette достигают portals, нет зависимости от порядка CSS chunks                                                           |
| Доступность и доступ | Keyboard/focus/labels/contrast/reduced motion по компонентам; guest/customer/admin сохраняют host-права; bootstrap и обычная регистрация различаются                                                                        |
| Переносимость        | Пакет подключается через public API к двум совместимым hosts без копирования исходников; fixture renderer проверяет сменность composition/primitives                                                                        |

Рабочий native fallback сохраняет эксплуатацию при незавершённой интеграции,
но не закрывает gate глобального One. Неподключённый экран или потерянная функция
фиксируются как незавершённая работа первого релиза. Проверочные preview-сборки
до этих gates не называются готовой первой поставкой.

## 9. Последующие этапы

За пределами первого One: общий installer/update/uninstall нового кода через
Admin, marketplace, Workshop-to-package producer и release bridge; новые
commerce/CRM/AI/Task Manager функции, inbox/billing backend, приглашения и новая
политика выдачи ролей. Интерфейс управления установленными шаблонами входит в One,
а работа с новым кодом подключается позже к тому же Extension Manager lifecycle.

**Следующая задача — TASK-24:** выбрать и зафиксировать единый стек по фактическим
зависимостям и актуальным первичным источникам. TASK-23 не обновляет библиотеки
и не подменяет этот выбор сохранённым списком версий из старого референса.

# Проверка переключения в браузере — TASK-21 / ONE-02

Название шаблона актуализировано 9 ноября 2026 года. Дата, результаты исходного
исследования, коды задач и пути evidence сохранены.

Дата: 19 октября 2026 года. Родитель: TASK-9.
Основание: [карта TASK-20](2026-10-19-template-coverage-audit.md).

## Результат

В установленном приложении подтверждено: **выбор Realize пока не заменяет
оформление всей области Admin**. Главные входы переключаются между оболочками,
но прямые маршруты сохраняют своих владельцев. `/admin/ai`, MCP, Usage,
коллекции и globals остаются Payload; `/system/task-manager` продолжает
использовать Realize даже при выбранной оболочке Payload.

Назначение mode/settings Realize сохраняется и применяется к новому открытию
подключённой страницы и после reload. Уже открытые страницы сохраняют прежний
renderer и локальное состояние. Это соответствует описанной реализации
[менеджера расширений](../specifications/extension-management.md), но не выполняет
требование пользователя о глобальном реактивном переключении.

Исходные значения восстановлены: **Realize, light, comfortable, 280 px**.
Frontend assignment остался без изменений. Временный customer удалён.
История операций сохранена; восстановление значений не откатывает ревизии.
Продуктовый код, миграции, конфигурация прав и установленная сборка не менялись.

## Среда, метод и границы

- Адрес: `http://localhost:3000`; runtime build `Dfi6Wz9am3HM5TVk5N8El`.
- Каталог: Payload Admin `3.88.0`, Realize `0.1.0`; одна палитра Realize `0.1.0`;
  для Frontend — ноль совместимых шаблонов.
- Исходники: `main`, `53e938d4a80d1d60b7d06d3ec73d70981854b3a8`.
  Полная provenance-связь bundle с этим commit отдельно не проверялась.
- Реальный Chrome через установленный Playwright; viewport `1440 × 1000`.
  Общий MCP-профиль был занят, поэтому использованы отдельные браузеры и contexts.
- Пользователь выполнил вход admin в отдельном окне. Второй admin context получил
  ту же действующую сессию в памяти, без экспорта credentials. Это не новый login
  другого администратора. Дополнительно проверены гость и отдельный вход customer.
- Переключения и recovery выполнены штатными кнопками UI. Безопасные GET DTO
  использованы для сверки current/revision/history. Fixture customer создан и удалён
  через штатный REST с точной проверкой его ID/marker/roles; admin ему не назначался.
- Task Manager ведёт TASK-21; локальный каталог содержит только evidence,
  без резервного `TASK.md` и manifest-дубля.

Это runtime-аудит представительных цепочек из карты, а не полный перебор всех
документов, 71 collection schema и возможных комбинаций подключённых модулей.
Результат не является приёмкой нового RealizeAI Control Panel или глобального host.
Документационный pre-edit gate: `not_contract_level`.

## Исходное и конечное состояние

| Параметр                                    | До проверки                                                  | После восстановления               |
| ------------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| Shell current                               | `template` — Realize                                         | `template` — Realize               |
| Shell previous                              | `native`                                                     | `native`                           |
| Shell revision / history                    | `4` / 4 receipts                                             | `6` / 6 receipts                   |
| Admin selection                             | `realize@0.1.0`, palette `realize@0.1.0`, `light`            | То же точное назначение            |
| Admin settings                              | `density: comfortable`, `panelWidth: 280`                    | Те же значения                     |
| Admin revision / history                    | `0` / 0 receipts                                             | `2` / 2 receipts                   |
| Admin previous                              | `null`                                                       | Проверочное `dark / compact / 320` |
| Frontend                                    | revision `0`, current/previous `null`                        | Без изменений                      |
| Theme preference проверочного admin context | Cookie отсутствует; `localStorage.payload-theme` отсутствует | Восстановлено то же состояние      |
| Catalog hash / runtime build                | Сохранены в исходном DTO                                     | Совпадают с исходными              |

Последовательность shell: `template → native → recover template`.
Последовательность appearance: `light / comfortable / 280 → dark / compact / 320
→ recover light / comfortable / 280`.
Оба цикла добавили по два receipts. История не удалялась, ревизии не переписывались.

## Матрица наблюдаемого поведения

| Сценарий                                                      | Наблюдение                                                                          | Результат и граница                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Прямой `/system` при Realize                                  | Рабочая область Realize                                                             | Подтверждён выбранный главный вход                                                       |
| `/admin/ai` при Realize                                       | Payload `DefaultTemplate`, native nav и собственный AI UI; `html[data-theme=light]` | Полное назначение System Admin сюда не поступает                                         |
| `/admin/collections/pages`, `/admin/globals/header`           | Native list/global editor с Payload nav                                             | Выбор Realize не заменяет редакторы                                                      |
| `/admin/collections/media`                                    | Медиатека под Payload                                                               | Отдельная цепочка оформления подтверждена                                                |
| `/admin/mcp-servers`, `/admin/analytics/ai`                   | Native shell, локальные UI-kit roots без template settings                          | MCP/Usage не наследуют `panelWidth/density` Realize                                      |
| `/system/workshop`, `/system/access`                          | Realize shell                                                                       | Подключённые рабочие host-страницы; бизнес-действия не выполнялись                       |
| Shell preview перед apply                                     | Отдельная native preview page                                                       | Current оставался `template`, shell revision `4`, appearance revision `0`                |
| Apply Payload                                                 | UI подтвердил применение; shell revision `5`                                        | `/admin` и `/system` открывают Payload                                                   |
| Прямой `/system/task-manager` при Payload                     | Остаётся Realize                                                                    | Shell choice не задаёт renderer каждого прямого маршрута                                 |
| Новая browser context + reload при Payload                    | Native dashboard сохраняется                                                        | Persisted shell работает между contexts и после reload                                   |
| Shell recover                                                 | Current `template`, revision `6`                                                    | Новый вход `/admin` ведёт в `/system`; уже открытый native dashboard сам не переключился |
| Appearance preview                                            | Dark, compact, panel token `320px`, spacing token `9px`                             | Candidate виден до apply; current не меняется от preview                                 |
| Appearance apply                                              | Admin revision `1`, exact candidate settings                                        | Новая страница и reload получают dark/compact/320                                        |
| Уже открытые Task Manager и appearance manager                | Старые light/comfortable/280                                                        | Автоматического обновления открытого renderer нет                                        |
| Light в profile menu                                          | Текущий экран сразу светлеет; появляется cookie `payload-theme=light`               | После reload cookie имеет приоритет над сохранённым `mode=dark`                          |
| Другой admin context без theme cookie                         | При новом открытии получает dark/compact/320                                        | Выбор пользователя в одном context не стал глобальным mode                               |
| AI/MCP/Usage после appearance apply, context без theme cookie | Остались native/light; нет `--realize-admin-panel-width`; обычный spacing `12px`    | Проблема не объясняется только пользовательской theme cookie                             |
| Публичные `/shop`, `/login`, `/create-account`                | Storefront renderer; HTML light/dark provider                                       | Отдельная от Admin цепочка; `/shop` после apply остался light                            |
| Frontend tab менеджера                                        | «0 для Frontend», «Оформление пока недоступно»                                      | Реальную смену frontend template выполнить невозможно в текущем каталоге                 |
| Protected Task Manager reference                              | Фиксированные comfortable/280, dark без cookie                                      | Reference намеренно не наследует рабочие density/panel settings                          |
| Public Task Manager reference                                 | Фиксированные comfortable/280, локальный light                                      | Не используется как доказательство успешного рабочего apply                              |
| Appearance recover                                            | Preview показал light/comfortable/280; current восстановлен, revision `2`           | Свежая страница подтвердила восстановленные DOM/CSS значения                             |

Для DOM различались native `.nav__wrap`/Payload root и Realize shell/UiTheme.
Настройки проверялись по CSS variables, computed background и фактической высоте
контрола, а не только по названию карточки в каталоге.

## Формы, планы, portals и переходы

В отдельной вкладке Task Manager открыта форма новой задачи с проверочным
несохранённым названием. Submit не выполнялся. Форма и введённый текст пережили
shell apply/recover и appearance apply в другой вкладке. Подготовленный appearance
plan с тем же ID также пережил shell-цикл и затем был применён. Это подтверждает
сохранение локального состояния при этих операциях, но не live switch renderer.

После reload проверочной вкладки диалог исчез; предупреждение `beforeunload`
не было показано. Повторное открытие формы и наличие прежнего текста в ней не
проверялись. **Сохранение несохранённого draft через reload не подтверждено.**
Принудительный reload поэтому нельзя считать доказанно безопасной заменой
реактивного обновления.

Старый dialog portal оставался light и с token `280px`. Новый dialog на странице
dark/compact/320 получил тёмный фон, theme wrapper со всеми settings, input height
`36px`; фокус находился внутри dialog. Profile menu получил тёмный фон своей
страницы. Полная клавиатурная/a11y-регрессия всех overlays не выполнялась.

Переходы по ссылке «Рабочий Task Manager» из AI и MCP успешно открыли
`/system/task-manager` в Realize после штатного открытия меню Payload.
Первоначальный click был сделан по ссылке закрытого меню: при viewport 1440 px
его DOM/box сохранялись, но computed opacity был `0`. Контент закономерно
перекрывал эту область. Проверка `Open Menu → click` сняла гипотезу о дефекте
перекрытия. **Этот случай не включён в подтверждённые дефекты.**

## Доступ и безопасные ошибочные состояния

Гость на `/system`, `/system/appearance` и `/admin/ai` направляется на native login.
Для `/admin/ai` дождались client redirect: первоначальный DOM до завершения
перехода не использовался как итог проверки ACL.

Отдельный временный пользователь с единственной ролью `customer` вошёл в своей
сессии; личность подтверждена browser fetch `/api/users/me`. `/system`,
`/admin/ai` и `/system/appearance` открыли `/admin/unauthorized` без рабочего UI.
Доступ проверялся по маршруту и содержимому, поскольку сам экран отказа возвращает
HTTP 200. Затем выполнены logout, точное удаление fixture и GET с HTTP 404.

Native неизвестный маршрут `/admin/task21-nonexistent-view` вернул HTTP 404,
`Nothing found` и native оболочку. Неизвестный корректно сформированный preview ID
показал «Предпросмотр недоступен» через reference/status presentation, без apply.
Такой fallback — ожидаемый управляемый отказ; он не равен принудительно вызванному
React exception boundary.

До проверочных изменений storefront `/` вернул HTTP 404. Причина отсутствия
главной страницы и содержимое CMS-документа `home` в этой задаче не анализировались.
Это наблюдение не приписывается переключению шаблонов.

## Подтверждённые разрывы и владельцы

| Наблюдение                                                                                               | Владелец                                          | Уже запланированное продолжение    |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| Shell choice действует на главные входы, direct routes остаются в двух оболочках                         | Host routing, общий template host, native adapter | TASK-25, TASK-34, TASK-44, TASK-45 |
| AI/MCP/Usage и native editors не наследуют полное назначение                                             | Plugin UI и host adapters                         | TASK-45, TASK-46                   |
| Открытые страницы сохраняют старый renderer; reload закрывает форму, сохранение её draft не подтверждено | Host/controllers и lifecycle переключения         | TASK-34, TASK-42, TASK-43, TASK-50 |
| Cookie mode имеет отдельный приоритет и область действия                                                 | Единый appearance contract и host preferences     | TASK-25, TASK-43                   |
| Нет установленного frontend renderer; сайт работает отдельно                                             | Template package и frontend host                  | TASK-47, TASK-48                   |
| Native auth/404 и template preview fallback используют разные источники                                  | Auth/status/recovery owners                       | TASK-39, TASK-40, TASK-49          |

Само сохранение назначения, штатные prepare/preview/apply/recover, разрешённые
переходы и проверенные ACL работают. Разрывы оцениваются относительно требуемого
глобального механизма; наличие локального поведения не доказывает готовность всей
системы. Новые архитектурные решения в этом отчёте не утверждаются.

## Evidence, проверки и ограничения

Материалы: `.ai-workspace/tasks/2026-10-19-realize-one-02-task9/`.

- `logs/appearance-before.json`, `appearance-after.json` — безопасные DTO и сравнение исходных значений.
- `logs/shell-native-applied.json`, `shell-recovered.json` — входы, прямые URL, другой context и открытые вкладки.
- `logs/previews-before-apply.json`, `appearance-applied.json`, `appearance-recovered.json` — preview, применение и восстановление.
- `logs/mode-preference.json`, `appearance-cross-surfaces.json` — cookie precedence и разные владельцы оформления.
- `logs/authenticated-baseline.json`, `browser-observations.json`, `customer-access.json`, `customer-fixture.json` — покрытие, роли, удаление fixture.
- `logs/reload-draft.json`, `native-navigation-confirmed.json`, `error-surfaces.json` — draft, штатная навигация и status surfaces.
- `screenshots/01-realize-appearance.png`, `04-dark-compact-dialog.png`, `05-dark-compact-appearance.png`, `06-restored-appearance.png` — визуальные состояния.
- `screenshots/02-realize-selected-ai-native-navigation.png` — native nav при открытом меню; `03-task-unsaved-dialog.png` — проверочный draft.
- `logs/product-before.json`, `product-after.json`, `git-inspect-before.json`, `git-inspect-after.json`, `verification.json` — неизменность продукта и самопроверка.

Auth tokens, passwords, auth cookies, storageState и HAR не экспортировались.
Отдельные браузеры и их процессы завершены; общий занятый профиль не закрывался.
Подтверждение неизменности продуктовых файлов и doc links фиксируется в
`verification.json`. Build, unit suite, migrations, deployment, commit и push
для этого браузерного аудита не выполнялись.

Существенные границы: нет второй compiled definition/palette для проверки
межпакетного переключения; нет frontend package; не выполнялись fault injection,
обрыв запроса во время apply, проверка восстановления неизвестного исхода,
коррупция хранилища, полный перебор редакторов/документов/модульных прав и
полная responsive-регрессия. Сохранность business commands при реальном live
renderer replacement этим шагом не доказана: такого механизма сейчас нет.

Применены [frontend-runtime-evidence](../../.codex/skills/frontend-runtime-evidence/SKILL.md),
[documentation sync](../../.codex/skills/skill-documentation-sync/SKILL.md),
[правило материалов](../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md),
[ограничение поиска](../../.ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md)
и [Git workflow](../../.ai/workflows/delivery/git/commit-push/WORKFLOW.md).
Результат сверяется с [архитектурой System Admin](../architecture/system-admin-shell.md)
и [ADR-0018](../architecture/decisions/ADR-0018-self-contained-template-packages.md).

## Следующий шаг

**TASK-22 / ONE-03:** разобрать референс Task Manager на оболочку, общие элементы,
примитивы и состояния для RealizeAI Control Panel. Выводы ONE-01/ONE-02 передаются в
дальнейший host-контракт; индивидуальные исправления маршрутов в этом шаге не начинаются.

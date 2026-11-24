# Чтение статьи в RealizeAI Control Panel

<a id="public-document-preview"></a>

## Публичный предпросмотр экрана чтения

**Предпросмотр реализован и проверен 2026-11-22.** Публичный маршрут
`/reference/control-panel/document` передаёт в `DocumentReadingScreen`
локальную fixture «Начало работы с RealizeAI Control Panel» с тремя разделами.
Страница разбирает начальные `mode` и `layout` общим валидатором.
Оформлением и выбором макета управляет `ControlPanelPreview`.
[Маршрут предпросмотра](<../../../../src/app/(control-panel-preview)/reference/control-panel/document/page.tsx>) · [Fixture документа](<../../../../src/app/(control-panel-preview)/reference/control-panel/document/documentReadingPreview.fixture.ts>).

Предпросмотр работает без обращения к БД, сохранения и редактирования.
Fixture используется только для показа. Сохранённые статьи открываются
через [защищённый маршрут чтения](#protected-document-reading).

### Представление и данные экрана

`DocumentReadingScreen` получает данные через `DocumentReadingScreenProps`.
В контракт входят `title`, необязательное `description`, дата `updatedAt`
в формате ISO и упорядоченный массив `sections` только для чтения. У каждого раздела есть
уникальный в документе `id` для перехода по якорю, заголовок `title` и массив
абзацев `paragraphs`. Экран выводит абзацы обычным текстом, а дату форматирует
для `ru-RU` в UTC. [Типы данных](../../../../src/components/admin/documents/DocumentReadingScreen.types.ts) · [Форматирование даты](../../../../src/components/admin/documents/formatDocumentUpdatedDate.util.ts).

Поверхность статьи занимает всю доступную ширину в общей сетке документов.
Внутри неё `UiContainer variant="reading"` ограничивает ширину текста.
`UiSurface asChild` оформляет семантический `article`. Заголовки `h1` и `h2`
и элементы `header`, `time` и `section` задают структуру статьи. Цвета,
поверхность и отступы используют токены UI-kit.
[Представление](../../../../src/components/admin/documents/DocumentReadingScreen.component.tsx) · [Геометрия экранов документов](../shell/content-grid.md#document-screen-geometry).

<a id="document-reading-registration"></a>

### Манифест и регистрация экрана

Проект поставляет описание компонента рядом с представлением.

| Поле манифеста | Значение |
| --- | --- |
| `identity` | `{ namespace: "realize", id: "document-reading-screen" }` |
| `kind`, `version` | `component`, `0.1.0` |
| `owner` | `{ identity: { namespace: "realize", id: "project.realize-ai-platform" } }` |
| `placement` | Цель `admin`, экран `workspace`, область `panel-content`. |
| `usage` | `scope: "preview-only"`, `contentMode: "read-only"`. |

Серверная регистрация находит владельца в реестре и проверяет, что это
корневой проект. Привязка представления хранит путь к модулю и имя экспорта
`DocumentReadingScreen`. Динамическая загрузка модуля из JSON не предусмотрена.
[Манифест компонента](../../../../src/components/admin/documents/documentReadingScreen.manifest.ts) · [Серверная регистрация](../../../../src/components/admin/documents/documentReadingScreen.registry.config.ts).

`agent` содержит описание с режимом `descriptive-only` и пустым списком
`operations`. Для `editor` указаны `metadata-only` и `readOnly: true`.
Манифест и регистрация описывают один экран чтения. Определение общего
профиля компонентов и общего каталога, публикация компонента, выдача агенту
инструментов и прав исполнения, а также допуск к размещению через редактор
выходят за границы этого среза. То же относится к установке runtime и
активации шаблона.

### Проверка публичного предпросмотра

22 ноября 2026 года в изолированном Chrome проверили `default` и
`without-topbar` при 1440 × 900 в светлой теме и при 390 × 844 в тёмной.
Во всех четырёх случаях отображались заголовок, дата и три раздела fixture.
При ширине 390 px боковая панель скрывалась. В макете без верхней панели
высота области содержимого увеличивалась на 52 px, высота footer составляла
36 px. Ни у страницы, ни у области чтения горизонтального переполнения не было.
[Результаты замеров предпросмотра](../../../../.ai-workspace/tasks/2026-11-11-control-panel-first-slice/logs/document-reading-20261122/browser-result.json).

<a id="protected-document-reading"></a>

## Защищённое чтение статьи

**Реализовано и проверено в изолированной среде 2026-11-22.**
Маршрут `/system/documents/[slug]` открывает одну сохранённую статью в
`panel-content`. Страница проверяет формат `slug` и параметры адреса.
Некорректный адрес даёт 404 до обращения к коллекции. Для корректного
адреса `requireSystemAdmin` проверяет административную cookie-сессию до
загрузки статьи. [Маршрут чтения](<../../../../src/app/(system-admin)/system/documents/[slug]/page.tsx>).

Сервер получает текущего пользователя из cookie-сессии и передаёт его как
`user` в Payload Local API. Запрос к `documents` ищет точное совпадение
`where.slug.equals` с `overrideAccess: false`, `depth: 0`, `limit: 1` и
`pagination: false`. После проверки маршрута коллекция применяет собственную
политику чтения. [Сервис чтения](../../../../src/components/admin/documents/readDocumentReadingScreen.service.ts) · [Права коллекции](collection-and-access.md#document-collection-contract).

Серверный mapper формирует данные для `DocumentReadingScreenProps`. Он
передаёт только `title`, необязательное `description`, `updatedAt` в ISO
и упорядоченные `sections`. Каждый раздел содержит `id` из сохранённого
`anchor`, `title` и массив строк `paragraphs`. Исходная запись Payload и
служебные ID строк остаются на сервере. Если запись отсутствует или её
содержимое не проходит проверку mapper, маршрут возвращает 404 без
подстановки другой статьи или тестовых данных. [Преобразование записи](../../../../src/components/admin/documents/mapDocumentReadingScreen.mapper.ts).

Экран использует выбранные в URL `mode` и `layout`. Переход к чтению
сохраняет рабочее назначение шаблона и не записывает настройки предпросмотра
в БД. Параметр `fromPage` определяет адрес ссылки «Все документы».
[Адреса и возврат к списку](list.md#адреса-и-возврат-к-списку).

После создания статьи форма открывает этот экран с исходным `fromPage`.
[Сохранение и отмена в форме создания](creation.md#сохранение-и-отмена).

Тот же экран можно открыть с локальной fixture в
[публичном предпросмотре](#public-document-preview).

### Проверка защищённого маршрута

22 ноября 2026 года администратор открыл созданную через Payload API статью,
затем повторно открыл её и увидел обновлённое содержимое. Запросы
с неизвестным и невалидным `slug` вернули 404. Гость и пользователь с ролью
`customer` получили перенаправление. В Chrome проверили обновлённый текст
в макетах `default` и `without-topbar` при 1440 × 900 и 390 × 844. Во всех
четырёх случаях горизонтального переполнения не было.
[Результаты проверки коллекции и чтения](../../../../.ai-workspace/tasks/2026-11-11-control-panel-first-slice/logs/documents-db-20261122/result-707a063fbc0d13c2.json).

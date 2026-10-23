# Локальный запуск и чат в Payload Admin

- **Статус:** current implementation runbook
- **Дата сверки:** 22 октября 2026 года (локальная активация исправления MCP/Git, TASK-52)

Этот runbook описывает существующий e-commerce baseline. Capability/config
foundation, hidden Payload persistence и aggregate Config API уже реализованы.
В `/admin/ai/settings` доступны сгруппированные каталоги, просмотр записей
и связей конфигурации, версии, системная основа, редакторы правил, профилей,
ролей, навыков, шаблонов инструкций, возможностей, проверок и рабочих процессов,
создание и активация выпуска, rollback.
Новый chat run сохраняет выбранный профиль активного выпуска; его инструкции
применяются внутри действующей read-only policy. Явно выбранные рабочие процессы
выполняются сегментами в чате и сохраняют checkpoints между продолжениями.

## 1. Требования

- Node.js `24.18.x`;
- npm `11.15.x`;
- PostgreSQL;
- установленный Codex CLI и включённое подключение Codex в Admin для чата;
- для code execution — отдельный локальный workspace root вне репозитория;
- для local preview — Chromium версии, соответствующей установленному Playwright;
- секреты только в локальном `.env`, который не коммитится.

Проверка toolchain:

```bash
npm run verify:runtime
npm ci
```

Для local preview установите браузер от имени пользователя execution worker:

```bash
npx playwright install chromium
```

После обновления Playwright повторите установку: пакет использует конкретную
ревизию браузера. Worker проверяет реальный headless launch/close до подготовки
promotion worktree, сборки и review. Ошибка окружения сохраняется отдельным
результатом проверки; одного наличия executable недостаточно.

### Capture Мастерской

В исходниках общего execution worker добавлен `react-capture-v1`, независимый
от Codex и его подключения. Это сборка сохранённой React-версии и три PNG,
а не интерактивный Next preview. Требуются Linux, `/usr/bin/bwrap`, работающий
systemd user manager с поддержкой cgroups/user namespaces, установленный
Chromium для `playwright-core`, системные browser libraries/fonts и runtime
зависимости `esbuild`, `react`, `react-dom`, `scheduler`, `playwright-core`.
Пакеты и браузер устанавливает оператор; job не скачивает зависимости.

До активации API применяют `20260925_170325_design_preview`, обновляют bundle
и worker. Host должен явно предоставить `canPreviewDesignWorkshop`; по умолчанию
plugin отказывает. Worker проверяет наличие toolchain, реальный Bubblewrap
запуск внутри systemd unit и private storage вне checkout. Только затем
heartbeat объявляет `workshopPreview`. Повреждённый browser runtime проявляется
как failed capture; успешный preflight не заменяет проверку реальной сборки.

Staging находится под `REALIZE_AI_PREVIEW_ROOT/workshop-capture/<installation>`;
namespace вычисляется из host/port/database без credentials. Каждая попытка
имеет отдельные job/token каталог и unit. Sandbox сбрасывает environment,
не получает сеть/home/БД, монтирует source/dependencies readonly; лимиты —
512 MiB, один CPU, 192 задачи, 60 секунд. Cleanup проверяет lease, останавливает
только unit своей попытки и затем удаляет staging. PostgreSQL хранит job и PNG
с TTL 24 часа; cleanup выполняется работающим worker. Смена storage root
требует предварительного штатного завершения прежних jobs/cleanup.

При недоступности изоляции host fallback отсутствует. После исправления
prerequisites перезапускают worker и проверяют свежий heartbeat, затем создают
реальное задание через Workshop API. В этой поставке UI-кнопки и GPT preview
tools ещё отсутствуют; основная локальная установка не обновлена.

## 2. Конфигурация

Скопируй `.env.example` в `.env` и замени placeholder-значения. Для локального
чата обязательны:

```dotenv
REALIZE_AI_RUNTIME_MODE=local-development
REALIZE_AI_CONTROL_PLANE_TOKEN=<случайное значение длиной не менее 32 символов>
REALIZE_AI_CONTROL_PLANE_URL=http://127.0.0.1:3100
```

Для вложений задайте `REALIZE_AI_CHAT_ASSET_ROOT`: абсолютный постоянный каталог
control plane вне checkout с правами `0700`. Payload обращается к нему через
авторизованный серверный API; общий filesystem между процессами не требуется.
Файлы отправленных сообщений сохраняются вместе с историей, поэтому каталог
нужно включить в резервное копирование наряду с БД. Публичная Media не используется.

Разрешение выполнения кода включается на вкладке «Агент» интеграции GPT — Codex
и по умолчанию выключено. Отдельному worker нужны инфраструктурные параметры:

```dotenv
REALIZE_AI_EXECUTION_SIGNING_SECRET=<отдельное случайное значение не короче 32 байт>
REALIZE_AI_EXECUTION_WORKSPACE_ROOT=/absolute/path/outside/repository
```

Для write-only credentials раздела `/admin/integrations` site runtime и
execution worker должны получить один installation-owned master key. Для
локального запуска его можно хранить в ignored `.env.local`. Общая команда
`npm run dev` загружает окружение через `@next/env` с приоритетом
`process.env`, `.env.development.local`, `.env.local`, `.env.development`,
`.env` и передаёт одинаковые значения всем процессам. Отдельные команды
control plane и worker читают `.env.local`, затем `.env`, сохраняя уже
переданное process env:

```dotenv
REALIZE_INTEGRATIONS_ENCRYPTION_KEY=<результат openssl rand -base64 32>
```

Payload secret не используется как fallback. После сохранения GitHub token
прочитать через Admin/API нельзя: можно только проверить подключение, заменить
credential или отключить интеграцию.

Предварительный просмотр разрешается на вкладке «Агент». Для его процесса
настраиваются каталоги и loopback-порты:

```dotenv
REALIZE_AI_PROMOTION_WORKSPACE_ROOT=/absolute/path/outside/repository/promotion-worktrees
REALIZE_AI_PREVIEW_ROOT=/absolute/path/outside/repository/preview-runtimes
REALIZE_AI_PREVIEW_HOST=127.0.0.1
REALIZE_AI_PREVIEW_PORT_MIN=3200
REALIZE_AI_PREVIEW_PORT_MAX=3299
```

Основная модель, модель проверяющего и сроки действия результатов задаются
на вкладке «Агент». Пустая модель проверяющего использует основную модель,
пустая основная — выбор провайдера. `REALIZE_AI_REVIEW_TIMEOUT_MS` ограничивает
время серверного процесса. Reviewer использует ту же интеграцию и read-only sandbox.

Публикация принятого preview commit в GitHub разрешается на вкладке «Агент».
Git executable и timeout остаются инфраструктурными параметрами:

```dotenv
REALIZE_AI_GITHUB_GIT_COMMAND=/usr/bin/git
REALIZE_AI_SOURCE_PROMOTION_TIMEOUT_MS=120000
```

Перед запуском нужно сохранить, включить и успешно проверить GitHub connection
в `/admin/integrations`. Repository-scoped token должен иметь
`contents:write` и `pull_requests:write`; права GitHub Actions для этого lane не
нужны.

`REALIZE_AI_WORKSPACE_ROOT` указывает на Git repository root, а
`REALIZE_AI_EXECUTION_WORKSPACE_ROOT` — на владельца временных execution
worktree. Promotion worktree и preview runtime roots также находятся вне
репозитория и не должны пересекаться с ним или друг с другом.

Все site/Payload URL должны указывать на один фактический origin браузера.
Например, если Admin открыт на `http://localhost:3000`, не смешивай его с
`http://127.0.0.1:3000`: Payload CSRF проверяет origin.

Подключите GPT — Codex в `/admin/integrations/codex`: доступны вход ChatGPT
через браузер или код устройства, API key, Codex access token и workload identity.
Для кода устройства разрешите этот способ в настройках безопасности ChatGPT.
API оплачивается отдельно от подписки; корпоративным способам нужны права
рабочего пространства и соответствующая серверная настройка. Сохранённые
секреты не выдаются через Admin/API. Порядок и условия всех способов — в
[архитектуре интеграции](../architecture/codex-integration.md#авторизация).

Next/Payload, control plane и worker должны видеть одну БД и постоянный
`REALIZE_CODEX_STATE_ROOT` (абсолютный путь вне репозитория). Для способов
с сохраняемым секретом также нужен общий master key; workload identity
использует отдельную серверную настройку без vault.
При пустом значении используется `~/.local/share/realize-ai-cms/codex`.
Codex CLI берётся из `PATH` либо из `REALIZE_CODEX_BINARY`. Подключение из Admin
обязательно для новых запусков агента; личная авторизация `~/.codex` не используется.
Ограничения описаны в [архитектуре интеграции](../architecture/codex-integration.md).

После авторизации откройте вкладку «Агент», включите «Админский агент включён»
и сохраните. Это единственный переключатель (`connection.enabled`); вход сам
агента не включает. Настройки применяются без перезапуска Next, control plane
или worker. Отдельные этапы выполнения по умолчанию запрещены. История, отмена
и откат доступны после выключения; уже принятые задания не отменяются автоматически.

Старые `REALIZE_AI_ENABLED`, `REALIZE_AI_EXECUTION_ENABLED`,
`REALIZE_AI_PREVIEW_ENABLED`, `REALIZE_AI_SOURCE_PROMOTION_ENABLED`,
`REALIZE_AI_RELEASE_ENABLED`, env-модели и env-TTL больше не управляют агентом.
Адреса процессов, ключ шифрования, подписывающий секрет, пути и ограничения
серверного исполнения остаются инфраструктурой. Проверки и preview получают
`REALIZE_AI_RUNTIME_ISOLATED=true`: копия БД не может включить в них агента.

## 3. База данных

Если Docker доступен, только PostgreSQL можно поднять отдельно:

```bash
docker compose up -d postgres
npm run payload:migrate
npm run payload:migrate:status
```

Для уже существующей schema-pushed базы сначала выполни процедуру adoption из
[раздела о миграциях](03-migrations-and-rollback.md). Не запускай baseline
миграцию непосредственно на production без восстановленной тестовой копии.

`PAYLOAD_DB_PUSH=false` должен оставаться значением по умолчанию для retained и
adopted БД. `PAYLOAD_DB_PUSH=true` допускается только для disposable local DB,
которую можно полностью пересоздать; после adoption такой режим запрещён.

## 4. Процессы разработки

Для настроенного локального окружения достаточно одной команды:

```bash
npm run dev
```

Она запускает Next, Media worker, control plane и execution worker. Перед запуском
проверяются инфраструктурные параметры и свободные порты; PostgreSQL session
lock запрещает второй совместный запуск того же checkout. Media worker читает
очередь напрямую из БД и не ждёт HTTP; execution worker запускается после
ответа health-маршрутов приложения и control plane.
Подключение и разрешения этапов по-прежнему задаются в админке: сам запуск
процесса не включает агента.

Пустой `REALIZE_AI_CONTROL_PLANE_URL` вычисляется из локальных `HOST`/`PORT`.
Если URL указан явно, он должен совпадать с ними. Порт Next можно передать
через `npm run dev -- --port 3001`; согласуйте с ним origin приложения.

`Ctrl+C` или `SIGTERM` останавливает приложение и control plane; worker
прекращает получение новых заданий и завершает уже полученное. При ошибке
одного сервиса общая команда также останавливает остальные и завершается
с ошибкой. Принудительное завершение worker не запускает повтор его текущего
задания: автоматического возврата незавершённых задач в очередь нет.

В режиме `central-control-plane` локальные AI-сервисы не запускаются, а Media
worker остаётся активным. `REALIZE_AI_RUNTIME_ISOLATED=true` исключает обоих
исполнителей и локальный control plane. Для отдельного запуска Next предусмотрен
`npm run dev:web`; Playwright использует эту команду с isolated-флагом.
`npm start` и Compose сохраняют отдельную схему серверного запуска и не
поднимают trusted local worker автоматически.

Control plane намеренно разрешает bind только на `127.0.0.1` или `::1`,
принимает bearer token, создаёт ограниченный Context Pack и запускает Codex в
read-only sandbox. MCP, dynamic tools и file changes заблокированы adapter-ом.
Встроенный веб-поиск разрешается только для сообщения чата с явно включённым
переключателем; code execution и reviewer сохраняют отключённый поиск.

Это development boundary для доверенного локального admin, а не
production tenant isolation. Не запускай его на workstation с чужими
credentials для недоверенных админов. Production требует центральный
изолированный worker с отдельной service identity.

Для обслуживания сервисы можно запускать отдельно, каждый в своём терминале,
при остановленной общей команде:

```bash
npm run ai:control-plane
npm run ai:execution-worker
npm run dev:web
```

Этот процесс нужен при включённом code execution, local preview, source
promotion или release. Он poll-ит durable PostgreSQL queues, атомарно claim-ит
одну задачу и никогда не запускается внутри Next/Payload HTTP request. Перед
выдачей `workspace-write` он проверяет HMAC capability, exact
plan/scope/version/base commit и expiration. Promotion не выдаёт
write-capability новому агенту: worker воспроизводит уже принятый diff, а
отдельный reviewer работает read-only.

На вкладке «Агент» диагностика показывает свежий сигнал исполнителя,
его доступность, занятость и текущее задание. Heartbeat записывается в БД
каждые 5 секунд; сигнал старше 20 секунд считается потерянным. Во время
долгого задания и штатного завершения процесса сигналы продолжаются.
Разрешение этапа сопоставляется с возможностями подключённых исполнителей.
В чате показываются причина ожидания и состояние назначенного исполнителя;
сведения о чужих заданиях не выдаются. Потеря сигнала не означает отмену
или автоматический повтор задания.

Затем войди администратором Payload. Чат открывается из боковой навигации или
кнопкой «Спросить AI» на обычных страницах Admin. Во вкладках «Чат» и «Инструменты»
интеграции GPT — Codex используется кнопка «Открыть чат» без дублирующей плавающей
кнопки. Режим открытия задаётся во вкладке «Чат»: правая панель, контентная область
или отдельное окно браузера.
Контентный вариант того же интерфейса доступен по адресу:

```text
http://localhost:3000/admin/ai
```

Каталог внешних подключений доступен отдельно:

```text
http://localhost:3000/admin/integrations
```

GitHub adapter принимает canonical HTTPS repository URL. Кнопка «Проверить»
делает server-side GitHub REST request; browser не вызывает GitHub напрямую.

### 4.1. Исполнитель Media

Обработка изображений использует штатные Payload Jobs: очередь `media`, задача
`processMedia`, одно задание за вызов `jobs.run` с `sequential:true`. Следующий
опрос начинается через 5 секунд после завершения предыдущего. `jobs.autoRun`
остаётся пустым; запуск через HTTP Jobs API запрещён, чтобы обработка не шла
параллельно в обход singleton. Это отдельный от AI execution worker процесс.

После применения миграций исполнитель можно запускать самостоятельно:

```bash
npm run media:worker
```

Для постоянного серверного процесса используется та же команда с
`NODE_ENV=production`. Ему нужны исходники приложения и production-зависимости
Payload (его штатный `payload run` подключает собственный TS loader),
то же подключение PostgreSQL, секрет Payload и общее постоянное хранилище Media,
что и приложению. Next-загрузка `.env*` выполняется до импорта Payload config;
исполнитель не включает schema push. `npm start` сам worker не запускает.
Serverless-процесс Next не заменяет постоянно работающий worker.

В `compose.yaml` предусмотрен отдельный `media-worker` на том же runtime image.
Миграции применяются до совместного запуска web/worker. Образ включает
`scripts/runtime`, `src`, `packages` и TS config; новую зависимость для worker
добавлять не требуется. Web и worker используют общий `media-private-data`
по `MEDIA_PRIVATE_STORAGE_DIR=/app/.data/media`, с правом записи uid 1001.
Публичный `media-data` подключён к worker только для чтения; web сохраняет право
записи. Корневая файловая система контейнеров read-only, `/tmp` — tmpfs. Каталог
`.data` исключён из Docker build context. Compose даёт 5 минут на остановку
текущего задания, затем может принудительно остановить процесс; последующий
запуск применяет ограниченное восстановление ниже. Проверка самого собранного
образа относится к deployment acceptance и не заменяется просмотром Dockerfile.

PostgreSQL advisory lock действует на очередь в текущей БД, независимо от
checkout. Второй worker завершается до чтения заданий. `SIGINT`/`SIGTERM`
прекращают опрос и дожидаются текущего `jobs.run`; Payload и singleton закрываются
после него. При потере соединения singleton процесс немедленно завершается:
продолжать работу без владения очередью небезопасно.

При следующем запуске только после получения singleton восстанавливаются
незавершённые `processing:true` jobs очереди `media` с `taskSlug=processMedia`,
без workflow и без окончательной ошибки. В `meta.mediaRecoveryCount` сохраняется
число аварийных восстановлений. Первые три возвращают job в обычный native
pending-процесс; следующее завершает его с `MediaRecoveryLimitError`. Input,
история task log, native `totalTried` и `waitUntil` сохраняются. Готовность набора
и идемпотентное повторное использование файлов определяет Media task. Ручной
повтор выполняется из карточки файла через отдельную прикладную операцию;
`runByID` и массовый сброс Jobs для этого не используются.

Эта защита распространяется на данный runner. Не запускайте параллельно
`payload jobs:run --queue media`, второй scheduler или прямой Local API runner.
Обычные ошибки задачи и backoff обрабатывает Payload; аварийный счётчик учитывает
прерывания до записи native task log. Фактическое восстановление после аварии
нужно проверять на изолированной БД, отдельно от unit-проверки жизненного цикла.

### 4.2. Постоянная локальная production-сборка

Для работы на этом компьютере после закрытия IDE, терминала и выхода из сеанса
настроен пользовательский systemd target `realize.target`. Включён `linger`;
target запускается при загрузке системы. Компьютер должен быть включён и
не находиться в режиме сна. Это локальная установка с адресом
`http://localhost:3000`, без изменения внешнего production deployment.

Unit-файлы принадлежат оператору и находятся в `~/.config/systemd/user/`:

| Служба                          | Процесс                                           |
| ------------------------------- | ------------------------------------------------- |
| `realize-postgres.service`      | Существующий PostgreSQL 18 на `127.0.0.1:55432`   |
| `realize-web.service`           | Production standalone Next.js на `127.0.0.1:3000` |
| `realize-control-plane.service` | Локальный AI control plane на `127.0.0.1:3100`    |
| `realize-execution.service`     | Штатный AI execution worker                       |
| `realize-media.service`         | Штатный Payload Media worker                      |

Службы автоматически перезапускаются после завершения процесса. Явный
`systemctl stop` оставляет их остановленными. Execution worker при остановке
завершает принятое задание; systemd ожидает его сохранения, а ограничения времени
отдельных этапов остаются в самом worker. PostgreSQL останавливается после
зависимых процессов. Настройки, модели и разрешения агентов остаются в Admin.

Управление из любого терминала:

```bash
systemctl --user status 'realize-*'
systemctl --user restart realize.target
systemctl --user stop realize.target
systemctl --user start realize.target
journalctl --user -u realize-web.service -f
```

Node.js `24.18.0` и npm `11.15.0` размещены отдельно от кеша IDE в
`~/.local/share/realize-ai-cms/node-24.18.0`. Службы используют абсолютный путь
к Node и полный установленный `node_modules`: control plane и execution worker
требуют `tsx`, поэтому `npm prune --omit=dev` к этой локальной установке
не применяется.

Каждый Node-процесс получает `NODE_ENV=production` и запускается с
`--import=./scripts/runtime/loadProductionEnvironment.mjs` из корня проекта.
Preload загружает штатные `.env.production.local`, `.env.local`,
`.env.production`, `.env` с приоритетом уже заданного process environment.
Секреты остаются в этих ignored-файлах и не копируются в unit-файлы.
`REALIZE_AI_RUNTIME_MODE=local-development` сохраняет доверенный локальный
AI transport; эта настройка не выбирает dev-сборку Next.

Web запускает подготовленный standalone bundle внутри `.next`. Перед его запуском production build
комплектуется `.next/static` и `public` по существующему
[Dockerfile](../../Dockerfile). `.next/standalone/public/media` ссылается на
постоянный `public/media` исходного проекта. Unit явно задаёт абсолютные
`MEDIA_PRIVATE_STORAGE_DIR` и `REALIZE_AI_WORKSPACE_ROOT`, поскольку standalone
меняет текущую папку. Media originals/variants и история интеграции сохраняют
прежние каталоги. `REALIZE_BUILD_WITHOUT_DATABASE` — только параметр отдельной
сборки без БД, на работающие службы он не передаётся.
В этом режиме корневой layout, загрузчик категорий `/shop` и общий
[`findPreviewDocumentBySlug`](../../src/utilities/preview/findPreviewDocumentBySlug.service.ts)
ожидают `connection()` перед чтением CMS. Дочерний сегмент может начать
prerender независимо от корневого layout, поэтому
[`CategoryList`](../../src/components/layout/search/Categories.tsx) и reader
страниц и товаров останавливаются до `getPayload()`. Сам по себе `draftMode()`
не останавливает prerender: в Next 16.4 он возвращает `isEnabled=false`.
Данные загружаются при HTTP-запросе с прежними проверками preview-доступа;
сигнал Next об остановке prerender передаётся без перехвата и кэширования.

Tracing ограничен корнем исходного проекта через `outputFileTracingRoot`.
Для вложенного source snapshot с общими `node_modules` задайте абсолютный
`REALIZE_BUILD_TRACING_ROOT` исходного checkout; снимок должен находиться внутри
него. Build owner проверяет границу до запуска этапов и заменяет унаследованный
`NEXT_PRIVATE_OUTPUT_TRACE_ROOT` проверенным значением. Корень файловой системы,
домашний каталог, чужой проект и зависимости Next вне выбранной границы
отклоняются. Default или заданный `REALIZE_CODEX_STATE_ROOT` должен находиться
вне этой области: runtime-данные Codex не являются входом сборки.
Путь приложения в standalone берите из `relativeAppDir` в
`.next/required-server-files.json`, поскольку вложенный снимок сохраняет свою
позицию относительно tracing root.

Для отдельного переносимого web bundle используйте общий упаковщик после
успешной сборки:

```bash
node scripts/runtime/standalone/packageStandalone.controller.mjs \
  --source /absolute/path/to/built-site \
  --output /absolute/path/to/new-bundle
```

Родитель output должен существовать, сам output — отсутствовать. Команда
создаёт новую копию, сохраняет вложенный `relativeAppDir`, `BUILD_ID` и search
receipt, добавляет `.next/static` и `public`. Абсолютные ссылки на зависимости
заменяются относительными только при наличии соответствующего target внутри
traced bundle; общий `node_modules` не копируется. Отсутствующий target,
выход за границу, private/runtime path или symlink среди static/public assets
останавливают упаковку с очисткой только созданного output. Исходная сборка
и существующий output не изменяются. Результат JSON содержит `appDirectory`;
сервер запускается из него командой `node server.js`.

Из `public/media` исходников читается только обычный статический `logo.svg`,
включённый также в allowlist source snapshot. Пользовательские загрузки не
обходятся; постоянное Media-хранилище подключается отдельно при deployment.
Другие entries в `public/media` traced bundle и ссылки вместо каталога или
logo отклоняются. Переносимость проверяется для совместимых Node, ОС и
архитектуры; подключения к БД и остальная runtime-конфигурация задаются при
запуске. Упаковка не запускает сервер и не переключает действующие службы.

Публичный upload Media использует `process.cwd()/public/media` текущего runtime.
Команды миграций и генерации типов запускаются из корня исходников и используют
`src/migrations` и `src/payload-types.ts`; standalone-сервер эти команды
не выполняет.

После изменения исходников требуется новая `npm run build`, обновление
standalone assets и перезапуск служб. Выполняйте это после завершения активных
заданий, остановив web и workers и оставив PostgreSQL доступным для сборки.
Одновременный `npm run dev` на тех же портах не запускайте.

Для изменений поиска build owner создаёт `.next/realize-search-build.json`
после typegen, TypeScript и Next build с неизменными search sources.
Manifest также копируется в standalone .next. Optional searchBuild в
/api/health/live подтверждает bundle реально работающего web-процесса. Это
generated manifest: вручную его не меняют. При переносе подготовленной сборки
сохраните его рядом с её BUILD_ID. Статус установленной версии требует
совпадения manifest, BUILD_ID и текущего source hash. Меняйте web/control plane/
execution/MCP согласованно: старые parsers JSONB state не должны работать
одновременно с новой записью aggregate/quality полей. Сохраняйте прежний bundle
для rollback и проверяйте отсутствие активных jobs перед переключением.

Для отдельного web bundle внутри `.next` подтвердите новый `/api/health/live`,
затем используйте `activateInstalledSearchBinding` из CLI owner: он проверяет
actual source/build и создаёт `.next/realize-search-active.json` атомарно.
Generated pointer позволяет CLI и службам читать receipt активного bundle,
сохраняя прежнюю сборку. Ручная запись manifest, pointer или BUILD_ID не допускается.
Production source snapshot создаётся с `readinessMarker=false`; fixture API
`/api/search-acceptance` в установленную систему не переносится.

**Текущее состояние, 22 октября 2026 года (TASK-52).** В 10:15 UTC
активирована сборка `.next/platform-execution-baseline-20261022`, BUILD_ID
`UC_Xr0YB_MtdFGCmWICbt`, sourceVersion
`689993ddd5ec2027534650e504adf60f3e3ace90edbe0d131a0b759476f9b24e`.
Override `99-zz-execution-baseline-20261022.conf` задаёт новый launcher и
compiled dist. Production build, canary и согласованная активация
web/control plane/execution/managed MCP прошли; новый worker подтвердил idle,
прежние jobs сохранены. System AI `realize-system-1.1.4` и
`installation-config-v9` остались прежними; Config CAS и перевыпуск не выполнялись.

По разрешению пользователя создан локальный commit
`9499902416cbd3bd799e9c759a122165d858641e` ровно из 16 согласованных файлов:
checkRunner, его тесты, четыре fixture suites и десять документов AI metadata.
65 прежних изменений сохранены вне commit; push не выполнялся. Свежие проверки
применённого состава прошли: 149 адресных тестов без failures/skips, scoped
ESLint/Prettier, headers и instruction graph. Ранее проверенный полный candidate
suite остаётся отдельным evidence; он не объявляется новым штатным execution job.

В 10:16 UTC реальные CLI definitions и managed MCP context/search/read
подтвердили новый binding, ветку `main`, указанный Git HEAD и полное чтение
`buildRepositorySourceLink` с совпадающим SHA-256. На этом этапе installed preflight
подтвердил **2/7**: `cli`, `mcp`. Последующая ручная проверка пользователя в Admin
direct, run `110`, conversation `66`, подтверждена серверным чтением завершённого
run, его ответа, lifecycle и search/read events текущего binding. Обновлённый
installed preflight на этом этапе подтвердил **3/7**: `cli`, `mcp`, `admin-direct`.
Затем пользователь проверил поискового субагента: run `112`, conversation `68`,
подтверждён зарегистрированными read handlers и событиями текущего binding.
Search/read завершились без усечения; lifecycle seq 293 подтвердил завершение
native descendants и archive до seq 294 `assistant.completed`. Точные child IDs,
число и модель не заявляются. После этого installed preflight подтвердил **4/7**:
`cli`, `mcp`, `admin-direct`, `admin-subagent`.
Пользователь также подтвердил внешнюю проверку ChatGPT отчётом и двумя ссылками.
Новые search/read events 10:56:48/52 UTC относятся к текущему binding, оба complete;
sourceUrl сохранён буквально, включая `utm_source=chatgpt.com`, и проверен по
SHA-256. URL диалога совпадает с прежним, но evidence использует только новые
события; приватный диалог инструментами не читался. На этом этапе installed
preflight подтвердил **5/7**: `cli`, `mcp`, `admin-direct`, `admin-subagent`, `chatgpt`.

В 11:28 UTC новая штатная попытка execution завершена успешно: plan run `113`,
conversation `69`, CR `22` / job `20`, база `9499902`, состояние `changes_ready`,
version `7`. Создан только `tests/int/repositorySourceLink.int.spec.ts`
(66 строк, девять тестов). Все пять обязательных checks прошли: secrets, lint,
typecheck, test:int и build. Integration: **3365 passed / 0 failed / 163 skipped**;
дополнительно прошли Prettier и source headers. DiffHash
`dc11208617286e90715cd719101d60d4ef07073251d2fc64bf9e5f04517e713b`, evidenceHash
`c3f07580cfb7caf2bb6982ab7cd81837c06b63f93845da082149d15d13a55a7c`.
Основной код не менялся; до обновления отчётности SHA-256 всех 65 прежних
изменённых путей совпали. Временный лимит execution `4G` возвращён к `3G`
после terminal + idle; перезапусков нет. Прежние failed jobs `18`/`19` сохранены.

Новые реальные execution search/read events текущего binding подтвердили
шестого consumer. Текущий installed preflight: **6/7**, отсутствует только `review`;
предыдущие checks и даты сохранены. Implementation acceptance, product review,
service commit и preview не выполнялись. Review-only endpoint отсутствует:
штатный `deploy-preview` после approved review автоматически создаёт service
commit, clone preview-БД и локальный сервер. Approval CR22 ограничен execution;
для следующего этапа требуется согласование готового diff и этих действий.
TASK-52 остаётся `in_progress`; полная installed acceptance — `incomplete`.
Evidence новой попытки: [execution и checks](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-baseline3-result.json),
[точный diff](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-baseline3-terminal.json),
[текущий installed preflight](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-baseline3-installed-preflight.json),
[восстановление ресурсов](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-baseline3-resource-restore-readback.json).
Evidence: [локальный commit](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/baseline-commit-result.json),
[свежие проверки](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/baseline-commit-fresh-checks.json),
[активация](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-baseline-activation-result.json),
[CLI/MCP и HEAD](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/baseline-commit-postactivation-result.json),
[preflight после активации](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/baseline-commit-postactivation-preflight.json),
[проверка Admin direct](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-direct-110-result.json),
[preflight после direct](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-direct-110-installed-preflight.json),
[проверка субагента](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-subagent-112-result.json),
[preflight после субагента](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-subagent-112-installed-preflight.json),
[исходные ссылки ChatGPT](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/chatgpt-baseline-20261022-operator.json),
[проверка ChatGPT](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/chatgpt-baseline-20261022-result.json),
[preflight после ChatGPT](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/chatgpt-baseline-20261022-installed-preflight.json),
[сохранённая runtime-конфигурация](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/baseline-commit-runtime-configuration.json).

**История активации 22 октября 2026 года, 07:25 UTC.** Локальная
установка переключена на bundle `.next/platform-admin-git-head-final-20261022`,
BUILD_ID `Mfqdf7h1W3_X-nmW3ydC7`, sourceVersion
`caf1f94b7b615aa8e4779621a9975d6dfb74077af812e03a9984e4123553204f`.
Override `99-z-admin-git-head-20261022.conf` задаёт launcher и compiled dist.
После проверки canary и idle остановлены web и потребители installed binding;
новый web прошёл readiness, штатный owner активировал binding, control plane,
execution и managed MCP перезапущены. Новый worker подтвердил свежий idle;
состав прежних execution/release jobs сохранён. После этого отдельный финальный
Config CAS активировал совместимый overlay.

Активны System AI `realize-system-1.1.4`, manifest
`e91a1d0df3c3c175ae8f83957dc0e8d9f90af930dfb509189b0165be96fec845`,
и `installation-config-v9`, manifest
`46706d6b36b480116502fcf2d4a127cbf7efa24bfaaa4808b4ae535b0a54aeab`,
pointer version `9`. Все 32 artifact content hashes из v8 сохранены, доступны
три прежних профиля; тексты «Инженера платформы» не менялись. Промежуточный
immutable system `1.1.3` сохранён в registry и не активировался. Runtime теперь
предоставляет `repo_git_head` в Admin direct/native MCP; временный Context Pack
по-прежнему не является Git checkout. Неудача shell Git внутри него не означает
недоступность Git рабочего проекта.

Реальный run `102`, conversation `59`, завершился в режиме `direct` с exact
snapshot `platform.engineering`/v9/system `1.1.4`. Агент получил HEAD
`53e938d4a80d1d60b7d06d3ec73d70981854b3a8`, ветку `main`, выполнил поиск и
прочитал `buildRepositorySourceLink`, приложив sourceUrl с SHA-256 и начальной
строкой. HEAD независимо сверил Git worker. Запуск использовал доверенный
локальный request существующего platform owner, зарегистрированные handlers
и terminal SSE; авторизованный browser E2E этим не заявляется.

Пользователь вручную проверил режим поискового субагента через Admin:
run `105`, conversation `61`, завершился с профилем инженера/v9/system `1.1.4`.
Серверные observations привязаны к текущим sourceVersion/BUILD_ID:
`repo_search` за 146,13 мс и `repo_read_file` за 2,35 мс завершились с
`outcome=complete`, без partial results. Ответ содержит sourceUrl на прочитанный
`buildRepositorySourceLink` с SHA-256. Независимая проверка подтвердила реальный
дочерний поток; lifecycle events фиксируют его закрытие и последующий
`assistant.completed`. Это ручная проверка пользователя с серверным
подтверждением, не автоматизированный browser E2E.

Следующий сценарий пользователь выполнил в реальном внешнем диалоге ChatGPT:
подтверждены исходный URL диалога проекта и sourceUrl. Точный conversation URL
сохранён без переписывания в task evidence; сверены события managed MCP с
текущими sourceVersion/BUILD_ID, строка исходника и его SHA-256. Первый поиск
по корню завершился по таймауту и не засчитан как положительное событие;
повторный поиск вернул `partial/page_limit`, допустимый текущим gate, а
последующее чтение — `complete`, все 26 строк и совпадающий hash.
Прежний connector smoke остаётся отдельной исторической проверкой.

Реальный execution job `18` для CR `20`, runID
`6339bb21-28ce-45e2-95df-6b3b77f79944`, выполнил поиск и чтение исходника.
Штатный installed adapter сверил сохранённые search/read events с текущими
sourceVersion/BUILD_ID и засчитал consumer `execution`. Это подтверждает работу
поиска и чтения в execution, но не успешное выполнение всего job: после
прошедших security и lint проверок `npm run typecheck` завершился с V8 heap OOM,
exit `134`, без timeout; job получил `failed`. До `test:int` и build он не дошёл.

Повторный job `19` для CR `21` при временных `MemoryHigh=4G` и `MemoryMax=4G`
прошёл security, lint и typecheck, но завершился `failed` на `npm run test:int`:
27 failed / 3327 passed / 163 skipped. Отдельный диагностический прогон того же
worktree с `REALIZE_BUILD_WITHOUT_DATABASE=false` дал 3338 passed / 16 failed /
163 skipped; новые девять тестов `repositorySourceLink` прошли. Это диагностика
окружения и исходной базы, а не повторная штатная приёмка job. После попытки
лимиты `realize-execution.service` восстановлены до `MemoryHigh=3G` и
`MemoryMax=3G`; installed sourceVersion/BUILD_ID остались прежними.

В изолированном disposable candidate подготовлены исправления: build-only
флаг checkRunner ограничен командой build, обновлены четыре устаревших test
fixtures и 13 ссылок AI metadata в десяти документах. Адресные проверки прошли:
четыре fixture suites — 61/61; checkRunner и instruction/evaluation suites —
39 passed с одним исключённым только из узкого harness real-descendant test;
instruction graph — passed. Первый полный диагностический прогон с symlink
на dependencies дал девять environment failures; его результат сохранён.
После физического копирования dependencies по контракту
`withWorkspaceDependencies` полный suite прошёл за 327,6 с: 3365 passed /
0 failed / 163 skipped. Guards не ослаблялись; отдельное исключение
real-descendant test из узкого harness в полный прогон не переносилось.
Typecheck прошёл за 54,6 с, scoped ESLint шести исходников — за 3,81 с.
После проверок физическая копия dependencies очищена; контроллер завершился
с exit `0`.

На этапе подготовки patch содержал ровно 16 файлов и ещё не был применён
в основной checkout. Для его установки требовались commit, согласованная
сборка, активация installed binding и обновление runtime: `checkRunner.ts`
входит в search sourceVersion. Эти 16 файлов не входят в inputs publisher System AI,
поэтому перевыпуск `1.1.4` и совместимого overlay v9 для данного patch не нужен.
Продуктовый review ещё не выполнен; успешный candidate suite не означает
implementation acceptance или изменение установленного runtime.

Для прежней сборки installed preflight подтвердил шесть из семи consumers: `cli`, `mcp`,
`admin-direct`, `admin-subagent`, `chatgpt`, `execution` для указанных
sourceVersion/BUILD_ID.
`npm run check:search` завершился с exit `1`
на предварительной проверке installed evidence, до тяжёлых checks: полный gate
остаётся `incomplete`, поскольку `review` ещё не подтверждён.
Исторические события прежней сборки не заменяют новые доказательства.
Evidence: [активация](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-git-head-activation-result.json),
[direct-диалог](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-git-head-chat-result.json),
[ручная проверка субагента](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-subagent-105-result.json),
[подтверждение ChatGPT](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/chatgpt-manual-20261022-installed-evidence.json),
[проверки execution job 18](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-review-checks.json),
[job 19](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-review-retry-terminal.json),
[диагностика без build-флага](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-review-env-diagnostic-result.json),
[восстановление лимитов execution](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-review-retry-resource-restore-readback.json),
[четыре fixture suites](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/env-baseline-tests-summary.json),
[адресные проверки checkRunner и инструкций](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/tmp/execution-baseline-candidate/logs/env-baseline-instructions-targeted.json),
[instruction graph](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/tmp/execution-baseline-candidate/logs/env-baseline-instructions-green.json),
[первый прогон с symlink dependencies](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/env-baseline-symlink-result.json),
[полный suite candidate](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/env-baseline-full-result.json),
[typecheck и scoped ESLint](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/env-baseline-static-results.json),
[manifest подготовленных исправлений](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/env-baseline-combined-20261022.json)
и [patch](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/env-baseline-combined-20261022.patch),
[evidence шести consumers](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-review-installed-evidence.json),
[installed preflight](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-review-installed-preflight.json),
[полный gate](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-review-full-gate.log).

Возврат обновления 07:25 UTC к runtime/system `1.1.2` требует совместимого
overlay v8 с новым Config CAS; один только возврат launcher оставит
несовместимый v9. Это ограничение перехода между System AI releases, а не
обновления execution baseline в 10:15 UTC, сохранившего System AI и overlay.
Автоматический возврат pointer после активации overlay не выполняется.

**История раннего обновления 22 октября 2026 года.** Локальная установка
обновлена для TASK-52. Отдельная
production-сборка прошла typegen, TypeScript, Next build и штатную упаковку;
bundle — `.next/platform-mcp-task52-20261022`, BUILD_ID
`MT42d6s_kTPUEos6ZoaBm`, sourceVersion
`a6e357a9cd53ef761e03378b8418a4e65c37c4acc636b77836891ff7d8d83439`.
Override `99-mcp-task52-20261022.conf` задаёт новый launcher и compiled dist.
Перед переключением проверены отдельный canary, свежий idle worker, отсутствие
queued/running runs и активной Codex lease. Полный список in-memory runs
control plane этой проверкой не подтверждается.
Actual live/readiness вернули `200`, БД доступна; штатный
`activateInstalledSearchBinding` согласовал active pointer с текущим source hash
и работающей сборкой. Перезапущены web, control plane, execution и managed MCP.
Bootstrap MCP, PostgreSQL и Media не перезапускались; старые jobs не изменялись.

Реальные CLI и managed MCP search/read записали события новой версии в БД;
installed preflight подтвердил эти два consumer. Realize AI connector также
вернул MCP `1.3.1`, `repository/git: ready`, HEAD и успешные search/read.
Полная installed acceptance остаётся `incomplete`: Admin direct/subagent,
execution/review и настоящий диалог ChatGPT с conversation URL ещё не подтверждены.
Connector smoke и успешная локальная активация не заменяют эти сценарии.
Canary остановлен, собственный disposable source snapshot удалён после проверки
замкнутости runtime bundle; readiness после очистки — `200`. Постоянное Media,
прежний bundle `.next/platform-access-20261019` и override 98 сохранены.
Новых миграций, commit/push и внешнего deployment при этом не выполнялось.

**История создания инженерного профиля 22 октября, до обновления runtime.**
По запросу пользователя создан и активирован
инженерный профиль `platform.engineering` («Инженер платформы», TASK-53).
Installation overlay — `installation-config-v8`, manifest
`5164b3bcfb86f3d9350b4023b93e72db8eb4ca62f474a6fe4a248c081a731606`,
active pointer — версия 8. Зарегистрированные Config handlers выполнили
draft → validate → release → activate с idempotency и hash-bound CAS.
Использован доверенный локальный maintenance request существующего владельца
из server allowlist с действующими host ACL; браузерная сессия не создавалась.
Каталог подтверждает три профиля. Все 27 прежних artifact content hashes
сохранены, добавлены пять инженерных артефактов; system release `1.1.2` не менялся.
Прежний совместимый v7 доступен для штатного rollback с актуальной версией
pointer. Пересборка, перезапуск служб и изменение прав для overlay не требуются.
Реальный chat run `100`, conversation `58`, завершился с exact snapshot
`platform.engineering`/v8: один `repo_search` и один `repo_read_file`, проверка
SHA-256 и sourceUrl в ответе. Оба события сохранены с `consumer=admin` и текущим
source/build. Вызов прошёл через зарегистрированные handlers и terminal SSE
в режиме `direct`; авторизованный browser E2E этим не заявляется.
Installed preflight той сборки подтвердил `cli`, `mcp`, `admin-direct`;
`admin-subagent`, `execution`, `review`, `chatgpt` оставались непроверенными.
Run `100` и этот preflight относятся к историческим v8/system `1.1.2` и binding.

18 октября 2026 года по согласованию пользователя web переключён на
System AI `realize-system-1.1.2`, manifest
`30dd1171e85d5a457a1c9b8b81478491961e6dc1d9b052772d2a2b94cc73c604`.
Bundle — `.next/system-ai-1.1.2-f4b8`, BUILD_ID `J2Fb13_m7FAKdmsxm_I-Z`;
override `96-system-ai-1.1.2-f4b8.conf` задаёт вложенный ESM launcher и его
runtime dist. Перезапущен только web: текущие CP/worker принимают сохранённые
System AI references; их PID, а также процессы PostgreSQL и Media сохранены.
Новых миграций не было. Пакет проверен по inventory до подключения постоянного
`public/media`; его исходный статический logo сохранён в `bundled-public-media`
внутри нового bundle и совпадает с logo постоянного каталога.

Перед переключением через штатный Config API создан и активирован резервный
`installation-config-v6`, совместимый с прежним web `1.1.1`. После переключения
создан и активирован `installation-config-v7` для `1.1.2`, manifest
`0f61633d1ba6d5a8556fc89180d9f01ab384d5e08605cbb2f16d7408dfee84f3`.
Во всех 27 артефактах сохранены ключи и content hashes. Прежний v5 допускал
только system `1.1.0` и давал конфликт runtime catalog; после активации v7
catalog отвечает `200`, доступны оба профиля ru-RU. Авторизованный браузер
подтвердил `/system`, `/admin/ai/settings` и отображение обоих профилей;
live/readiness вернули `200`. Реальный AI-запрос этим этапом не запускался.

На момент переключения read-only агрегаты БД не показывали активных runs,
running usage, свежих claimed jobs или Codex lease; worker был idle. Полный
in-memory idle CP этим не доказывается. После пользовательской приёмки в
16:45 UTC штатный `activateInstalledSearchBinding` переключил search active
pointer на новый bundle. Actual health, compiled receipt и свежий source hash
`b66c7c87f30c2489337eee8b5bb137a806cb652d5ac4cf087f868a4eb25677f1`
совпали; `readInstalledSearchBinding` подтвердил новый BUILD_ID. Финализация
не потребовала перезапуска служб. Локальное обновление принято и завершено.

Сохранены bundle `.next/rename-runtime-d9a1`, override 95 и резервный v6 для
System AI `1.1.1`. Окно возврата до приёмки завершено: старый bundle имеет
другой search source hash и не может объявляться установленной версией текущих
исходников. Старый web также не поддерживает новые execution contexts `1.1.2`.
Наличие резервов не подтверждает полный откат после начала новой работы;
generated binding вручную не переписывается. Настоящий AI-запрос, полное
восстановление данных и исправление snapshot/tracing helpers остаются вне
результата этой установки.

1 октября 2026 года локальный web переключён на bundle
`.next/search-runtime-43b7`; actual health подтвердил BUILD_ID
`HU811fKNC2LyfWTuDT4AQ`, после чего создан active pointer. Новый override
`realize-web.service.d/60-search-production-integration.conf` задаёт только
launcher; прежний `50-search-observability-release.conf` и bundle сохранены.
Control plane, execution и оба MCP listeners перезапущены согласованно;
PostgreSQL, Media и отдельные workshop fixtures продолжают прежнюю работу.
Managed discovery подтверждает 9 инструментов; SDK search/read и доставка
событий подтверждены на этом build. Реальный пользовательский запрос ChatGPT
пока не подтверждён, поэтому полная installed acceptance остаётся неполной.

5 октября 2026 года по запросу пользователя локальная админка переключена
на проверенный bundle `.next/analytics-runtime-e42b`, BUILD_ID
`WpcmW_wYgjRdbWy1IDHHO`. Раздел **Аналитика → Расходы ИИ** доступен по
`/admin/analytics/ai`; owner view — `/admin/analytics/ai/platform`.
Override `70-ai-analytics-dashboard.conf` меняет только launcher;
прежний bundle и override `60-search-production-integration.conf` сохранены.
Согласованно перезапущены web, control plane, execution и оба MCP listeners.
Actual health и current source hash проверены до создания active pointer
штатным `activateInstalledSearchBinding`. Canary остановлен; PostgreSQL,
Media и отдельные preview не перезапускались.

Схема usage ledger уже применена, новых миграций при переключении не было.
`design_preview` и `workshop_mcp` остаются pending, как и до переключения.
Worker имеет свежий heartbeat `idle`, control plane отвечает `ready`;
неавторизованный usage API возвращает `401`, браузер перенаправляет на login.
UI обеих ролей проверен отдельно на fixture; авторизованная браузерная
приёмка основной установки не заявляется. После явного подтверждения владельца
в серверном allowlist указан account `1`, перезапущен только web. Доступ
владельца и отсутствие этого доступа у другого admin проверены.

12 октября 2026 года локальный web переключён на bundle
`.next/task-manager-runtime-b9f6`, BUILD_ID `nI4hr4968GPA0XV6tm-Sv`.
Постоянный Task Manager открывается по `/system/task-manager` после входа
администратора. Override `80-task-manager-activation.conf` меняет только
launcher; прежний `70-ai-analytics-dashboard.conf` и analytics bundle сохранены.
Штатный production build выполнен на source snapshot без fixture API и DB
credentials: typegen, TypeScript и Next build прошли, полные source manifests
до/после совпали. Shared auth gate считывает request headers до getPayload,
чтобы защищённые страницы определялись как request-bound до подключения к БД.

Новый bundle сначала проверен на отдельном loopback-порту с рабочей БД,
затем включён на `:3000`. Live/readiness вернули `200`; Task projects/tasks,
Git observations/history без сессии — `401 UNAUTHENTICATED`, экран — `307`
на login с адресом возврата; `/api/search-acceptance` отсутствует (`404`).
Actual health подтвердил BUILD_ID и source hash, после чего штатный
`activateInstalledSearchBinding` создал active pointer. Новый web, control plane,
execution и оба MCP listeners работают с `NRestarts=0`; canary остановлен.
PostgreSQL и Media сохранили прежние процессы и каталоги.

Перед сборкой подтверждён свежий idle worker без текущего задания. Две старые
execution-записи `validating` от 15 сентября и release `queued` от 17 сентября
сохранены; их состояния после переключения совпали с baseline. Новый worker
имеет свежий idle heartbeat. Readiness не является доказательством отсутствия
in-memory runs control plane.

Адресно применены только две Task migrations; итог — 29 receipts с сохранением
прежних 27. Backup рабочей БД не создавался по прямому указанию пользователя;
проверка восстановления этой БД не заявляется. Workshop `design_preview` и
`workshop_mcp` остаются pending. Подробности —
[Task Manager migrations](03-migrations-and-rollback.md#task-manager-foundation-и-git-снимки).
Девять auth contract tests и browser acceptance прошли на fixtures. На рабочей
установке браузер подтвердил штатную страницу входа; авторизованная приёмка
рабочего Task Manager пока не выполнена. GitHub check runs для текущего
fine-grained PAT возвращают `403`; credentials этим этапом не изменялись.

Для отката приложения остановите связанные службы, удалите только новый
`80-task-manager-activation.conf`, выполните `daemon-reload` и запустите прежний
launcher вместе с control plane/execution/MCP. Task schema и история сохраняются.
Installed search binding требует актуальных source/build checks; прежний bundle
с другим source hash нельзя объявлять текущей установленной версией.

Проверка настоящего чата обнаружила несовместимость active overlay v4
с system `1.1.0`. Через штатные draft, validation, release и CAS activation
опубликован `installation-config-v5`; содержимое всех 27 artifacts сохранено.
Исторический v4 и системный выпуск не изменялись. Новый read-only run `95`
в conversation `52` завершён через настоящий control plane. Ledger и API
аналитики подтверждают 38 879 input / 314 output tokens, включая 17 792 cached
input, и 23 112 ms. В клиентском scope теперь 1 `customer_runtime` attempt,
в обзоре владельца — 10 attempts с учётом прежних 9 `evaluation` attempts.
Запрос выполнен доверенным локальным Payload request подтверждённого владельца
через зарегистрированные handlers с ACL и idempotency; браузерная сессия
не создавалась. Денежная стоимость unknown: тариф для ChatGPT не назначался.
Локальная активация не является release/RC;
устаревший evaluation baseline необходимо обновить перед таким выпуском.
Результаты приёмки приведены выше; временные логи завершённой задачи очищены.

Для этой установки deployment copier сохранил generated JS/manifests побайтно
и пропустил только tracing-копии внешних Node/Codex launcher каталогов
`home/gio/.local` и `home/gio/.codex`. Исходные абсолютные platform paths и
корневые `node_modules` должны оставаться доступными на этой машине. Это
условие переноса локального bundle; проверка health не доказывает его
переносимость на другую машину. Media нового runtime ссылается на постоянный
`public/media`. Disposable source snapshot удалён после проверки bundle,
health и отсутствия зависимостей symlinks от временного каталога.

При недостатке RAM тяжёлые этапы запускайте по одному под жёстким лимитом
systemd/cgroup; `REALIZE_BUILD_LOW_MEMORY=true` использует один Next page/static
worker. Heap не ограничивает суммарный RSS.
Low-memory режим отключает webpack cache и ограничивает heap Next/его дочерних
workers до 1024 MiB после успешного полного TypeScript. Это уменьшает cache
overhead, но может увеличить время сборки; outer cgroup остаётся обязательным.
Candidate/fixture snapshot может
находиться в собственном `/tmp`; проверяйте его место и влияние tmpfs на память.
Успешные fixture checks не заменяют `check:search` для установленной версии.

Для администратора MCP доступен через «Настройки → MCP-серверы» и прямой адрес
`/admin/mcp-servers`. Если пункт отсутствует, а адрес возвращает Not Found,
проверьте актуальность работающей standalone-сборки: изменение исходников само
по себе её не обновляет. До запуска новой версии должна быть применена
`20260923_120805_internal_mcp` по [порядку миграций](03-migrations-and-rollback.md).
Проверка обновления включает переход из меню и перезагрузку прямого адреса.

25 сентября 2026 года в эту локальную установку доставлена первая Мастерская:
Payload → «Рабочая область → Мастерская» и `/system/workshop`, а также пункт
общей системной навигации. Для страницы требуется вход администратора.
Доступны проекты, бриф, материалы, текстовые файлы, сравнение изменений и
история версий. Перед запуском применена `20260925_133735_design_workshop`;
точный production bundle проверен в браузере на отдельной копии БД.
Preview и запись через ChatGPT этим обновлением ещё не подключаются.

27 сентября 2026 года подключена [диагностика поиска](../architecture/repository-search.md)
на `/admin/ai/search`: Payload → «AI & Delivery → Диагностика поиска» и системное
меню → «AI → Контроль и качество → Диагностика поиска». Перед обновлением web
применена только независимая `20260927_070914_search_observations`; две миграции
Workshop preview остаются pending. Сборка, переходы, история и диагностика CLI
проверены с тестовым администратором на отдельной БД.

Диагностика запускается вместе с поиском: `agent-search` автоматически пишет
ограниченный локальный SQLite буфер, `realize-control-plane.service` доставляет
его в PostgreSQL. Страница обновляет новые события раз в 2 секунды, загрузка
файла не требуется. Для локальной установки consumer использует тот же
`REALIZE_AI_WORKSPACE_ROOT`, что CLI checkout; его lifecycle принадлежит
существующему control plane. При выключенном control plane поиск работает,
но новые CLI-события остаются в ограниченном буфере до возобновления службы.
Managed MCP сохраняет собственные поисковые замеры через runtime collector.

Управление хранением требует `20260928_102009_search_observation_state` до
обновления web, control plane и managed MCP. `/admin/ai/search` показывает
действующую revision, настройки (1–7 дней, 100–10 000 записей, 1–60 минут),
preview ручной очистки и состояние доставки. Сохранение сразу применяет лимиты;
повтор запроса безопасен по UUID, параллельные изменения защищены CAS.
Heartbeat раз в 10 секунд подтверждает revision каждого сборщика. Автоочистка
работает и без managed MCP, пока включён control plane; при выключенных обоих
возобновляется на старте. Если состояние задержано, проверь службы и их журналы,
затем доступность БД; поиск ради проверки состояния запускать не требуется.
Ручная очистка не служит диагностическим тестом рабочей истории. Возврат bundle
не требует удаления state; `down` после изменения revision намеренно запрещён.
28 сентября эта миграция применена адресно: 25 receipts, две независимые
миграции Workshop по-прежнему pending. Web, control plane и managed MCP обновлены;
bootstrap MCP и другая preview-служба не перезапускались. На идентичной сборке
проверены настройки, конфликт сессий, подтверждение/отмена очистки, сохранение
новых событий и повтор после потерянного ответа. Реальный CLI автоматически
доставляет события; рабочая история вручную не очищалась.

При переключении 28 сентября web использовал `.next/search-standalone/server.js` через
`~/.config/systemd/user/realize-web.service.d/50-search-observability-release.conf`.
Drop-in заменяет только ExecStart, сохраняя штатный preload и окружение.
Отдельный bundle позволяет сохранить `.next/standalone`, который также использует
другой локальный процесс на `:3227`. Public media подключена к прежнему каталогу.
Контракт наблюдений поиска и эксплуатация:
[поиск по репозиторию](../architecture/repository-search.md).

30 сентября локальная web-служба обновлена для аналитики поиска: график времени,
полноты выполнения и объёма чтения, среднее/p95 и сравнение до/после выбранной даты.
Точный устанавливаемый bundle проверен в Admin на отдельной PostgreSQL,
включая мобильную ширину; после переключения проверены readiness и выдача
нового JS-файла графика. Рабочая история, настройки и схема БД сохранены.
Предыдущий bundle находится в `.next/search-standalone-analytics-previous-71d2`;
control plane, workers, MCP и посторонний preview не перезапускались.

Предыдущая сборка перед управлением хранением сохранена в
`.next/search-standalone-lifecycle-previous-b42e`; переключение bundle выполняется
после подтверждения `MainPID=0` и отсутствия job. При штатном SIGTERM Next может
оставить unit в `failed` с exit 143 — это следует отличать от живого процесса.
При следующем обновлении следует учитывать этот drop-in: для возврата к обычному
`.next/standalone` сначала подготовить и проверить его bundle, затем удалить
только `50-search-observability-release.conf`, выполнить
`systemctl --user daemon-reload` и перезапустить только `realize-web.service`.

Проверки execution выполняются одновременно с работающей CMS, поэтому им нужен
отдельный бюджет ресурсов. Следующий профиль для локального компьютера с
8 логическими CPU и примерно 7 GiB RAM применён к `realize-execution.service`
после успешной полной контрольной сборки с описанной ниже цепочкой Webpack.
Профиль ограничивает службу execution двумя разрешёнными CPU,
`CPUQuota=200%`, `MemoryHigh=3G`, `MemoryMax=3G` и
`MemorySwapMax=2048M`. Это верхние границы процесса и его потомков, а не
резервирование свободной памяти или гарантия успешной сборки. Доступный swap
проверяется отдельно. Ограничения остальных служб и пользовательских программ
не меняются. Бюджет общий для всего cgroup execution, включая Codex, проверки
и запущенные preview; несколько preview уменьшают запас для следующей сборки.

В этом профиле рабочие копии новых execution jobs размещаются на диске через
`REALIZE_AI_EXECUTION_WORKSPACE_ROOT=~/.local/share/realize-ai-cms/execution-workspaces`
(в unit используется абсолютный путь). На этом хосте `/tmp` — tmpfs: копирование
туда `node_modules` дополнительно расходует RAM/swap. Старые зарегистрированные
worktrees не перемещаются этой настройкой. Тот же принцип применяется к
`REALIZE_AI_PROMOTION_WORKSPACE_ROOT` и `REALIZE_AI_PREVIEW_ROOT`: профиль задаёт
дисковые каталоги `promotion-workspaces` и `previews` внутри того же
installation runtime. Promotion worktree содержит зависимости и сборку
предпросмотра; preview root — журнал и временный дамп БД. Перед сменой этих
корней у работающей установки нужно проверить существующие preview runtimes:
их cleanup вычисляет путь по текущей конфигурации. Для одного задания необходимо место
под исходники, реальную копию зависимостей и `.next`; сборки и очистка сохраняют
штатный lifecycle worker. Node `24.18.0` учитывает также `MemoryHigh` при выборе
доступного heap, поэтому его нельзя без проверки опускать ниже бюджета,
необходимого TypeScript. Лимиты проверяются полной сборкой, включая этот этап.

Для команды `npm run build` штатный check runner задаёт
`TURBO_TASKS_AVAILABLE_PARALLELISM=2` после caller overrides. Остальные проверки
не наследуют эту переменную из окружения хоста. Это ограничение основных
Rust workers Turbopack, подтверждённое для Next `16.3.1`:
[параметр turbo-tasks](https://github.com/vercel/next.js/blob/v16.3.1/turbopack/crates/turbo-tasks/src/parallel.rs#L20-L40)
используется [Tokio runtime Next](https://github.com/vercel/next.js/blob/v16.3.1/crates/next-napi-bindings/src/lib.rs#L84-L112).
Параметр внутренний; при обновлении Next требуется повторная проверка native
сборки. Он не ограничивает общий RSS, blocking threads или число page-data
workers. Жёсткий предел памяти задаёт systemd либо соответствующий лимит
контейнера в другой установке.

Команда проекта `npm run build` использует
`scripts/runtime/buildProduction.controller.mjs`: сначала `next typegen`
формирует production-типы маршрутов, затем отдельный `tsc --noEmit` проверяет
проект и завершает процесс, после чего запускается `next build --webpack`. Ошибка или
отмена любого этапа запрещает следующий. Только последний дочерний процесс
получает внутренний `REALIZE_BUILD_TYPES_VERIFIED=1`, который отключает
повторную встроенную проверку в `next.config.ts`. Входное значение этого флага
удаляется перед генерацией и проверкой типов. Обычный прямой `next build` без
внутреннего флага сохраняет встроенную проверку. Флаг не является настройкой
админского агента и не входит в список наследуемых worker environment variables.
`experimental.cpus=2` в Next config отдельно ограничивает workers сбора данных
страниц и prerender: настройка Rust parallelism и CPU affinity не заменяют этот
предел. Ограничение уменьшает параллельность сборки, не число обслуживаемых
приложением запросов. Production entry использует штатный Webpack с
`experimental.webpackBuildWorker=true` и `webpackMemoryOptimizations=true`:
отдельные процессы компиляторов завершаются последовательно. Явное включение
worker необходимо, поскольку `withPayload` добавляет собственный Webpack
callback. Эти экспериментальные настройки требуют проверки совместимости при
обновлении Next/Payload; настройка команды разработки не меняется.
Внутренние этапы остаются в группе внешнего runner;
при адресном сигнале только PID контроллера вне этой группы он пересылает сигнал
непосредственному child. Полное завершение потомков обеспечивает штатный
check runner либо cgroup systemd.

Основные проверки новых планов сохраняют порядок: secrets, lint, typecheck,
test:int, build. Дополнительные явно запрошенные проверки следуют после них
в стабильном порядке без дубликатов; в частности, e2e может требовать готовую
сборку. Состав обязательных проверок сохраняется. Отдельный `npm run typecheck`
остаётся настоящей проверкой; `incremental` в TypeScript позволяет повторно
использовать её промежуточный результат, но не заменяет успешный exit code.
Сохранённые планы, порядок их проверок и approval hashes не переписываются.

Execution worktree создаётся строго из подтверждённого `baseCommit`.
Изменения build scripts в основном checkout попадут в такие сборки только
после обычной доставки исходников и выбора содержащей их базовой версии.
Перезапуск worker сам по себе не обновляет исходники старых рабочих копий.
Настройки дисковых корней и ограничение parallelism в trusted check runner
действуют независимо от версии `baseCommit`.

Ошибки проверок сохраняют безопасную диагностику кода выхода, сигнала и
срабатывания тайм-аута. Код `137` или `SIGKILL` сам по себе не доказывает OOM:
причину устанавливают по журналу ядра и cgroup memory events. На POSIX тайм-аут
завершает всю созданную группу процессов проверки, включая потомков npm;
после периода ожидания применяется `SIGKILL`. На Windows используется
завершение непосредственного дочернего процесса. Эти ограничения не меняют
обязательные проверки, их approvals или сохранённые состояния старых jobs.

## 5. Ожидаемое поведение

- чат виден только Payload-пользователю с ролью `admin` и сохраняет выбранный
  диалог при переходах между страницами Admin;
- один provider обслуживает панель и `/admin/ai`; скрытая поверхность не
  запускает лишний SSE/polling. Отдельное окно `/admin/ai/window` принимает
  выбранный диалог и черновик от своего окна Admin, без хранения текста в URL;
- состояние выбранного диалога и его служебная ссылка обновляются одним
  dispatcher; consumer updaters не изменяют ref. В Strict Mode повторное
  вычисление React не рассинхронизирует карточки и фоновое чтение;
- видимый диалог обновляет незавершённые execution/preview/source promotion/
  release задания опросом каждые 1,5 секунды. Выход из очереди, блокировка,
  ошибка и завершение отражаются без перезагрузки; поздний ответ не заменяет
  новые сообщения или результаты действий. Когда активных заданий не остаётся,
  опрос прекращается;
- сообщения, события, Change Requests, Data Operations, hash-bound decisions,
  transactional outbox, execution jobs, deployments, integration settings/audit,
  installation config drafts/releases/events и check results сохраняются в
  скрытых Payload collections;
- browser получает только DTO/envelope, не raw Payload documents;
- приватные вложения, выбранные версии файлов проекта и признак веб-поиска
  сохраняются с сообщением; идемпотентность учитывает весь контекст запроса;
- блок ввода поддерживает загрузку/перетаскивание файлов и вставку изображений.
  Форматы, ограничения и приватное хранение описаны в
  [интеграции Codex](../architecture/codex-integration.md#вложения-и-контекст-сообщения);
- automatic SSE reconnect использует `Last-Event-ID`, а полная
  перезагрузка UI восстанавливает active run через persisted replay;
- до первого фрагмента UI явно показывает подключение/анализ и прошедшее время;
  при разрыве stream показывает восстановление связи и кнопку ручного retry;
- потерянный terminal SSE не оставляет composer заблокированным: UI сверяет
  active run через `GET /runs/:id`, сохраняет live-текст до загрузки durable
  conversation detail и затем показывает persisted assistant message;
- параллельные SSE-подключения к одному run сохраняют совпадающее событие
  идемпотентно: проигравший конкурентную вставку bridge продолжает поток, а
  совпавший `eventID` с другим envelope считается ошибкой идентичности;
- завершённый ответ с точными project paths можно оформить как отдельный
  Change Request; карточка показывает risk level, scope, проверки, hashes и
  expiration;
- ответ с поддерживаемым catalog intent можно оформить как отдельную Data
  Operation; в текущем slice разрешено только добавить одну существующую
  категорию одному существующему товару;
- dry-run строится Payload-ом из актуальных документов и показывает категории
  до/после; browser и модель не передают готовый patch или raw document;
- apply доступен только после подтверждения exact operation hash и версии,
  выполняется через Payload Local API с access, hooks, транзакцией и
  optimistic lock; approval и результат сохраняются в audit/outbox;
- rollback является отдельным compensating действием: admin подтверждает exact
  rollback hash, после чего Payload восстанавливает before-snapshot, если
  applied version товара не устарела;
- admin может отдельно утвердить или отклонить конкретную версию плана;
  approval криптографически привязан к plan/scope/version/actor/expiration;
- после approval доступный code/theme scope можно поставить в durable очередь;
  endpoint возвращает управление без запуска Codex в HTTP-процессе;
- worker создаёт отдельную ветку и worktree от зафиксированного `HEAD`, поэтому
  незакоммиченные изменения основного checkout в job не попадают;
- исполнитель и reviewer используют отдельный приватный профиль Codex на время
  задания. История родителя доступна native поисковому помощнику, затем весь
  профиль удаляется после закрытия процесса и синхронизации credential;
  постоянная история чата не затрагивается;
- обязательный поиск делегируется native помощнику с ограниченными путями и
  заданием на чтение. Сервер явно поручает этот поиск в turn input исполнителя
  и reviewer, сохраняя исходный запрос, план и ограничения developer policy.
  Родитель получает его результат и закрывает сессию;
  внешний monitor и отдельный `codex exec` в этом этапе не запускаются;
- для trusted check phase worker материализует установленный `node_modules` как
  реальную локальную директорию worktree и удаляет её после проверок; внешний
  symlink не используется, потому что Next.js 16/Turbopack отклоняет build,
  выходящий за filesystem root проекта;
- protected owner layers (`.ai`, `.codex`, platform packages/services,
  migrations, Payload config/access и delivery/security scripts) блокируются;
- заблокированное execution-задание не возвращается в очередь при перезапуске
  worker или повторном запросе исполнения. Текущий API возвращает существующее
  задание. Для нового исполнения нужен новый ответ с планом, новый Change Request
  и его подтверждение; пояснение модели не заменяет эти серверные действия;
- после Codex worker повторно сверяет фактические changed paths, запрещает
  symlink/out-of-scope diff, выполняет только команды из server registry и
  сохраняет bounded unified diff, hashes и check evidence;
- пустой diff блокирует выполнение до автоматических проверок. Итоговое
  пояснение исполнителя, если оно получено, сохраняется в `workerSummary` и при
  отказе; известные credentials и локальные корни маскируются до записи. Текст
  модели показывается отдельно от серверной причины и не подтверждает успех;
- execution получает отдельную инструкцию реализации уже утверждённого плана.
  Упоминания чтения или оформления плана в предыдущем ответе не меняют текущую
  роль; разрешённые файлы, реальные ограничения среды и все проверки сохраняются;
- фактический результат требует второго implementation acceptance, связанного
  с diff/evidence hash;
- после implementation acceptance admin может отдельно создать local preview:
  worker byte-for-byte применяет сохранённый diff к его base commit, повторяет
  security/format/lint/typecheck/tests/build, запускает новый ephemeral
  read-only reviewer и только после его approval создаёт service commit;
- preview использует exact standalone build, новый sanitized DB clone,
  loopback URL и Playwright/Chromium smoke; URL показывается только после
  readiness и успешного smoke;
- для изменения, целиком ограниченного `src/app/(reference)/reference/`,
  worker выводит URL из единственного изменённого статического `page.tsx` и
  проверяет эту страницу, например `/reference/realize-ai`. Допустимые route
  groups исключаются из URL; неоднозначный или динамический маршрут отклоняется.
  Для остальных scope smoke сохраняет `/`. Readiness всегда проверяется по
  `/api/health/ready` того же origin; переход на другой URL не считается успехом;
- технически неуспешный preview можно повторить кнопкой «Повторить preview»,
  пока действуют принятие реализации и execution evidence. Новая попытка
  сохраняет историю предыдущей и повторяет полный набор проверок и review.
  Сервер атомарно сверяет version, diff/evidence, base commit и approval binding;
  повтор с тем же idempotency key не создаёт новую попытку. Блокировка review,
  принятое/отклонённое preview, активный runtime или истёкшее подтверждение
  повтор этим действием не допускают;
- artifact/commit/reviewer/check hashes доступны в карточке Change Request;
  принятие или отклонение preview является отдельным hash-bound решением;
- rejection и TTL очищают process, DB clone, worktree и server-owned branch,
  пока execution worker запущен;
- preview acceptance сама не применяет commit в основной checkout, не выполняет
  push и не запускает production deploy;
- отдельное действие «Опубликовать draft PR» ставит source promotion в durable
  queue; worker публикует exact commit только в `ai/changes/**`, проверяет
  remote ref и создаёт open draft Pull Request без merge authority;
- недоступный control plane отображается как явная ошибка, а не успешная
  заглушка.

Локальный chat run store control plane находится в памяти. Перезапуск процесса
прерывает незавершённые chat runs. Завершённые checkpoints workflow остаются
в Payload и позволяют продолжить следующий сегмент; потерянный активный
provider turn останавливается с ошибкой, а не исполняется заново автоматически.
Code execution queue хранится в PostgreSQL,
а promotion worktree, runtime и DB clone являются локальными артефактами
конкретного worker host.

Текущий local worker предназначен только для доверенного разработчика: он не
является multi-tenant sandbox и использует локальную Codex identity. Sanitizer
покрывает известные auth/session/order/address/form контуры, но не заменяет
организационный аудит всех будущих PII-полей. Production требует ephemeral
container/VM, отдельную service identity, lease recovery, external artifact
storage, OCI image/digest, сетевую preview-изоляцию и production-grade cleanup
controller.

## 6. Агентский слой и Config API

Открой «Настройки → Агентский слой» (`/admin/ai/settings`) под пользователем с
правом управления конфигурацией. В верхней панели выбери черновик или создай
новый; для опубликованного используй копию. Боковое меню объединяет разделы
в группы «Рабочая область», «Агенты», «Инструкции», «Выполнение» и «Управление».

Открой «Все записи» или каталог нужного вида. Поиск проверяет название, ключ
и краткое содержимое; фильтры позволяют выбрать включённые/выключенные записи
и наличие входящих ссылок. Доступны сортировка и страницы по 25 записей.
Открой запись для просмотра содержимого и переходов «Использует / Используется в».
При возврате и смене раздела сохраняются поиск, фильтры, сортировка и страница
каждого каталога в текущей рабочей области.

В «Все записи» выбери «Тип новой записи» и нажми «Создать запись». В отдельном
каталоге используется кнопка соответствующего вида: «Новый профиль», «Новая роль»,
«Новый навык», «Новое правило», «Новый шаблон», «Новая возможность»,
«Новая проверка» или «Новый рабочий процесс». Создание недоступно во время
операции и при достижении 512 записей; в черновике только для чтения кнопок нет.

В разделе «Правила» создай или измени правило и сохрани его. В «Профилях агентов»
создай профиль или открой существующий. Укажи ключ, название, назначение, язык
и состояние включения. После сохранения ключ профиля изменить нельзя;
копирование открывает новую локальную форму с уникальным редактируемым ключом
и не записывает профиль до сохранения.

В сворачиваемых группах выбери роли, навыки, правила, шаблоны инструкций,
рабочие процессы, связи возможностей и проверок. Используй поиск по названию
или ключу, фильтр выбранных и страницы по 25 записей; в каждой группе можно
выбрать до 128 связей. Отсутствующие и выключенные цели показаны в списке:
проверь предупреждения и при необходимости исключи ссылки. Процесс по умолчанию
выбирается из выбранных рабочих процессов; исключение этого процесса очищает
значение по умолчанию. Переход к связанной записи использует общую защиту
несохранённой формы.

В «Ролях» задай инструкции и выбери связанные возможности. В «Навыках» дополнительно
укажи назначение и условия применения (`triggerTerms`). В «Шаблонах инструкций»
задай текст, переменные и назначение (`slot`): инструкции агента, планирование,
рецензирование или шаг рабочего процесса. Фразы применения навыка и имена
переменных вводятся по одному значению на строку; имена — без фигурных скобок.
Перед изменением или отключением проверь блок использования под формой
сохранённой записи и при необходимости открой связанные объекты.

В «Возможностях» выбери системную возможность с точной версией, затем укажи
разрешённые действия, области чтения/записи и лимит объектов. В «Проверках»
выбери зарегистрированную системную проверку. Для больших списков доступны
поиск, фильтр выбранных и страницы по 25 вариантов.
В группах «Области чтения» и «Области записи» переключатель «Наследовать
из системной основы» использует системный состав. Выключи его, чтобы выбрать
области самостоятельно: первоначально пустой выбор запрещает все области
этого вида. В поле «Максимум объектов» оставь пустое значение для наследования
системного лимита или задай положительное целое число, не превышающее его.
Неизвестные сохранённые значения не исчезают сами: исправь их явно,
сверившись с текущей системной основой.

Роли, навыки, шаблоны, возможности, проверки и рабочие процессы можно копировать.
Копия открывается с новым уникальным
редактируемым ключом и появляется в черновике только после сохранения.
Ключ сохранённой записи изменить нельзя; исходная запись и входящие ссылки
при копировании остаются прежними.

В «Рабочих процессах» нажми «Новый рабочий процесс», заполни общие сведения
и «Лимит выполнения шагов» от 1 до 64. В каталоге выбери «Тип нового шага» и нажми
«Добавить шаг». Доступны ход агента, запрос ввода, возможность, проверка,
условие и завершение. Настрой начальный шаг и переходы; у выбранного шага
укажи связанные шаблоны, возможность или проверку. Поиск, фильтр типа,
режим «Только требующие внимания» и страницы по 25 помогают работать
с большим процессом.

У шага возможности добавь входные параметры. В списке выбери параметр,
задай имя и «Источник значения»: входные данные процесса, результат шага
или заданное значение. Для первых двух укажи путь, для результата — также
шаг-источник. Заданные текст, число, логическое и пустое значения вводятся
в отдельных полях; объект и массив — как JSON только этого значения.

Чтобы переименовать шаг, измени «Ключ шага» и нажми «Применить ключ» либо
«Отменить изменение ключа». Применение обновит все ссылки на этот шаг;
до решения процесс сохранить нельзя. При удалении сначала исправь ссылки,
перечисленные в причине блокировки. Нажми «Сохранить процесс»: все правки шагов
сохраняются вместе; структурно корректные незавершённые связи можно оставить в черновике.
Запусти проверку конфигурации: она проверяет весь черновик, включая связи
с профилями, а не только открытую форму.

Раздел «Версии» позволяет искать и просматривать черновики и выпуски страницами
по 15 записей. API загружает до 100 последних элементов каждого вида; поиск
работает в этом наборе. В «Системной основе» доступны фактические системные
возможности, их ограничения и проверки, без просмотра файлов `.ai/**` и `.codex/**`.

Чтобы применить конфигурацию к новым ответам чата:

1. Сохрани все изменения и нажми «Проверить черновик». Исправь ошибки связей
   и компиляции профилей; проверка должна перевести черновик в `ready`.
2. Нажми «Создать выпуск». Кнопка доступна для `ready` draft без несохранённых
   правок. Выпуск фиксирует точный состав; исходный черновик становится доступен
   только для чтения и копирования.
3. Просмотри созданный выпуск или открой его в «Версиях». Каталог состава
   поддерживает поиск и переходы по записям и связям; «Сведения о выпуске»
   показывают исходную ревизию, совместимость и контрольную сумму.
4. Нажми «Активировать выпуск N». Это отдельное переключение для новых запусков;
   уже созданные runs сохраняют прежнюю конфигурацию. Для rollback открой более
   ранний совместимый выпуск и нажми «Вернуться к выпуску N».
5. В чате раскрой «Следующий запуск» и проверь профиль и выпуск. При нескольких
   профилях выбери нужный; доступен поиск и страницы по 25 записей. Единственный
   профиль выбирается автоматически при первом чтении и виден по имени.
   После смены выпуска устаревший выбор требуется повторить; текст сообщения
   сохраняется. Выбор переносится между панелью, страницей и отдельным окном.

Новый ответ использует профиль, прямые роли, правила, навыки и прямые шаблоны
с назначением «Инструкции агента» (`agent_instructions`). Доступные переменные:
`request`, `context`, `profile_key`, `profile_title`, `locale`; default `context`
содержит только ключ, название и locale профиля. Шаблон с другой активной
переменной нужно исправить перед запуском. Slots планирования, рецензирования
и шага workflow в обычное сообщение не включаются. Явный выбор процесса
добавляет exact шаблон текущего шага; ссылки возможностей и проверок сами
по себе не предоставляют инструментов или подтверждения выполнения checks.
Лимиты snapshot и инструкций, сохранение истории и разделение provider threads
описаны в [интеграции Codex](../architecture/codex-integration.md#конфигурация-агента-для-чата).

Чтобы запустить опубликованный процесс, выбери профиль и раскрой «Режим
сообщения» → нужный рабочий процесс. В списке есть поиск и страницы по 25 записей;
процесс по умолчанию отмечен, но автоматически не запускается. При необходимости
раскрой «Дополнительные данные процесса» и введи JSON-объект. Не добавляй поле
`request`: текст сообщения передаётся отдельно. На этом этапе workflow принимает
текст и JSON без вложений и выбора файлов проекта; явный web search доступен
для read-only обращения к агенту.

Отправь сообщение. Карточка «Выполнение рабочего процесса» показывает текущий
шаг и состояние. После ответа агента нажми «Продолжить процесс». Если процесс
задаёт вопрос, нажми «Ответить на запрос процесса» и отправь текст через обычное
поле сообщения; можно вернуться к обычному чату, не теряя сохранённый checkpoint.
Обновление страницы восстанавливает состояние из Payload. Повтор продолжения
возвращает тот же child run; изменённый ответ на уже продолженный шаг вызывает
конфликт. Смена активного выпуска не меняет snapshot начатого процесса.

Выбор процесса и «Дополнительные данные процесса» сохраняются при переходе
между панелью, страницей и отдельным окном. Незавершённый JSON переносится
как текст черновика; исправить его потребуется перед отправкой. Если запрос
ещё не получил подтверждения, перенос в другое окно или возврат блокируется
с объяснением: повтори запрос либо обнови его сохранённое состояние.

Если после обновления диалога шаг остаётся в очереди, нажми «Повторить запуск
шага». Сервер повторит передачу того же сегмента и не создаст новый child.
Потеря уже выполняющегося ответа после перезапуска control plane отображается
как ошибка и останавливает процесс; такой ответ автоматически не запускается
заново. Сохранённые сообщения, checkpoints и подготовленные операции остаются
доступны в диалоге.

Capability подготавливает настоящий preview назначения категории товару;
проверка сверяет его актуальные данные и audit-событие. Изменение данных требует
отдельного подтверждения и применения в карточке DataOperation. Без подходящей
операции, необходимых прав или значения шага процесс останавливается с причиной.
Checkpoint ограничен 128 КиБ UTF-8 и общим лимитом до 64 шагов. Формат путей
и границы исполнения описаны в [workflow runtime](../specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md#108-исполнение-workflow-сегментами).

Для общего обзора открой «AI & Delivery → Запуски процессов»
(`/admin/ai/runs`). Фильтры процесса и профиля ищут также исторические записи;
период относится к дате начала процесса. Фильтры и страница сохраняются в URL,
поэтому возврат из карточки восстанавливает список. Поиск и страницы работают
на сервере и охватывают историю за пределами загрузки диалога.

В карточке сверху находятся текущий статус и доступное действие: продолжение,
ответ, восстановление передачи queued шага или отмена активного ответа.
Во вкладках доступны ход выполнения, результаты, проблемы и операции,
требующие подтверждения. После решения операция остаётся видна с актуальным
состоянием и доступными действиями применения/отката. Права на изменения
данных проверяются отдельно. Ответ или незавершённый запрос удерживает карточку
от случайного закрытия; неизвестный результат повторяется с прежним телом и ключом.

Ссылки «Процесс», «Профиль» и «Выпуск» показывают сохранённую конфигурацию этого
запуска, даже после переключения active pointer. Переход к диалогу сохраняет
текущий текст и контекст чата. Некорректная ссылка или недоступный выпуск
показывает ошибку; переход к активной конфигурации вместо исторической не выполняется.

При конфликте ревизий сначала сохрани нужный текст отдельно, затем явно обнови
черновик и повтори изменение. При неопределённом сетевом результате используй
повтор операции в интерфейсе: он не создаёт новую запись с другим ключом.
Для создания выпуска и активации повтор сохраняет тело и ключ команды;
после подтверждённого receipt повторяется только чтение результата.
При конфликте active pointer обнови состояние и заново просмотри выпуск
перед следующим действием. Сохранение, проверка и создание выпуска не активируют
конфигурацию автоматически. База знаний и evals пока недоступны.

Authenticated admin bootstrap доступен через
`GET /api/realize-ai/config`. Mutation endpoints требуют заголовок
`Idempotency-Key` длиной 8–128 символов и strict body с
`schemaVersion: "1.0"`:

1. `POST /api/realize-ai/config/drafts` создаёт editing draft с
   `expectedRevision: 0`.
2. `PUT /api/realize-ai/config/drafts/:id` полностью заменяет artifacts по
   exact revision; новый artifact имеет revision 1, изменённый повышает её на
   один.
3. `POST /api/realize-ai/config/validate` проверяет exact draft/system manifest
   и только при success переводит draft в `ready`.
4. `POST /api/realize-ai/config/releases` требует ready revision и
   `expectedSystemManifestHash` из bootstrap, после чего создаёт immutable
   release.
5. `GET /api/realize-ai/config/releases/:id` возвращает verified full snapshot.
6. `POST /api/realize-ai/config/activate` принимает `action: "activate"`
   или `"rollback"`, `releaseID`, `expectedReleaseManifestHash`,
   `expectedSystemManifestHash` и `expectedPointerVersion` из просмотренного
   состояния. При отсутствии pointer его ожидаемая версия равна 0.
   Успех возвращает новую версию `ActiveAIConfigPointer`; rollback требует
   более раннюю версию release, совместимую с текущей системной основой.

`GET /api/realize-ai/config/runtime` доступен пользователю с `canUseChat`:
возвращает active pointer, сводку release и включённые профили, без инструкций
и черновиков. Отправка сообщения передаёт только `agentConfiguration`
с `releaseID`, `manifestHash` и `profileKey`. Snapshot собирает и сохраняет сервер.

Config API не изменяет `.ai/.codex`. Для ручных запросов используй same-origin
authenticated browser session; не добавляй Payload cookies или секреты
в shell history и документацию.

## 7. Ручная проверка Data Lane

1. Открой `/admin/ai` под пользователем с ролью `admin`.
2. Попроси добавить существующую категорию существующему товару, указав
   однозначный `id`, `slug` или `title` обоих документов.
3. Нажми «Шаг 1 · Подготовить изменение данных» и сверь блоки «До» и «После».
4. Нажми «Шаг 2 · Подтвердить vN», а затем отдельно
   «Шаг 3 · Применить». Сообщение «подтверждаю» в чате не заменяет
   hash-bound подтверждение exact версии в карточке.
5. Убедись, что карточка перешла в «Применено», а категория появилась у товара.
6. Для проверки восстановления отдельно подтверди и выполни откат; карточка
   должна перейти в «Откат выполнен», а набор категорий — совпасть с исходным.

Не используй этот lane для production-данных до появления production tenant
isolation и operational policy. Неоднозначные selectors, уже назначенная
категория, stale document version и отсутствие Payload access завершаются
fail-closed без записи.

## Системный AI artifact и обновление runtime

С PLAT-03 (4 октября 2026) выполнять `npm run ai:system:check` перед обновлением
web/CP/worker. Публикуемый набор задаёт
`packages/change-engine/src/system-ai/systemAIRelease.source.json`; он включает
явно выбранное runtime-правило из `.ai` и происхождение исполняемых builders.
После изменения уже выпущенного набора владелец назначает новую версию/ID,
готовит её регистрацию в `systemAIRelease.registry.ts`, сохраняя прежние
releases, затем выполняет `npm run ai:system:publish`. Registry входит в
provenance, поэтому его правка после публикации требует нового выпуска.
Опубликованный ID не перезаписывается другим
содержимым. Проверка publication включена в `npm run ci`.

Перед использованием нового кода нужна миграция
`20261004_161914_ai_execution_context`. Она добавляет private nullable snapshots
на CR/job. Web, control plane и execution worker должны использовать совместимый
system artifact. Исторический run/план без binding можно читать; новый execution
потребует нового run и плана. Active overlay выбирается существующим UI;
включение release не переписывает прежние snapshots.

Overlay, скомпилированный с прежним system manifest hash, требует нового
совместимого выпуска и активации через `/admin/ai/settings`. Исторический
release не переписывается; пока совместимый профиль не активирован, его
использование для нового запуска отклоняется.

После обновления system перед приёмкой чата проверь `/config/runtime`
в авторизованном Config API: общий health `ready` не подтверждает совместимость
активного overlay. При несовместимости создай новый draft на основе активного
выпуска, проверь его текущим compiler и активируй новый immutable release
с проверками ожидаемых system hash и pointer version. Изменять compatibility
старого release вручную нельзя.

Product runtime игнорирует AGENTS.md и project `.codex` как policy Codex.
Работа разработчика в IDE и отдельный Git worker сохраняют свой рабочий протокол.
При этом оба входа и repository tools GPT/MCP используют общий программный
Git executor `@realize/git-runtime` по
[ADR-0016](../architecture/decisions/ADR-0016-development-git-delivery-handler.md).
Product owners проверяют CR/job, approval и evidence; IDE — разрешённый scope
и checks; MCP — principal и grants. Общая блокировка `git-common-dir`
координирует изменяющие Git-фазы, не удерживается на build/review/копировании БД
и не объединяет эти разрешения. Developer hooks/signing и контролируемый
service commit preview сохраняют разные профили.

Проверки IDE и platform execution/preview используют общий
`@realize/verification-runtime`. Сервер выбирает checks из одобренного плана и
хранит receipts в `.ai-workspace/runtime/verification` исходного repository,
вне candidate worktree. Неизменные `lint`, `format:check`, `typecheck` допускают
повторное использование; source/config/environment/runtime/dependencies drift
требует нового запуска. Между рабочими копиями нужен lease общего materializer,
подтверждающий происхождение dependencies. Build выполняется для получения
артефактов; БД, browser, integration tests и secrets check также выполняются
заново. Usage измеряет текущую операцию; `outputSummary` явно отмечает reuse.
Контракты approvals и `WorkerCheckResult` не расширены. Подробности —
[verification runtime](../../packages/verification-runtime/README.md).

Эта интеграция входит в исходный System AI release `realize-system-1.1.6`.
Выпуск `realize-system-1.1.7` дополнительно связывает очистку preview-БД:
после восстановления дампа удаляются credentials, device requests, refresh
history и rate limits (`access_*`) вместе с остальными приватными runtime-данными.
Очистка применяется только к созданному клону; ошибка прерывает preview и удаляет
этот клон. Source binding установки включает manifest и все исходники
`packages/verification-runtime/src`.
Запись о source release не подтверждает активацию установленного runtime;
её проверяют по действующему system binding и свежему execution/preview evidence.

Изменения общего пакета и machine read ports меняют source binding. После
сборки нужны отдельная активация и проверка установленного runtime; успешные
проверки исходников и старые installed receipts не заменяют этот шаг.
Рефакторинг Git owner сам по себе не запускает preview или развёртывание.
Это локальная доверенная сборка; внешний клиентский host и закрытый vendor AI
сервис физически разделяются на PLAT-10. Детали —
[контракт system/overlay](../specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md#1011-опубликованный-system-ai-release-и-исполнение).

## Расходы ИИ и аккаунт владельца

После миграции ledger перезапусти web, control plane и execution worker из одной
совместимой сборки. В серверном окружении всех трёх задай одинаковые стабильные
`REALIZE_INSTALLATION_ID` и `REALIZE_PROJECT_ID`. Их смена создаёт другую область
учёта и не переносит существующую историю.

Раздел «Аналитика → Расходы ИИ», `/admin/analytics/ai`, доступен администратору
установки: динамика и сравнение периодов, рекомендации по оптимизации,
история, фильтры и собственный месячный бюджет. `/admin/analytics/ai/platform` требует
отдельного `canViewPlatformUsage`; в этой установке он проверяет числовые IDs
существующих admin-аккаунтов из `REALIZE_PLATFORM_OWNER_USER_IDS`. Пустой список
закрывает доступ. Первый admin автоматически владельцем не назначается.
Обычный admin не может изменить, удалить или разблокировать owner account.
Allowlist хранится на сервере и не редактируется в клиентской админке.
Прежние `/admin/ai/usage` и `/admin/ai/usage/platform` открывают те же экраны.
Путь в исходниках появляется в работающей установке после обновления её сборки.

Владелец публикует неизменяемые тарифы с источником, задаёт provider budgets и
сверяет суммы с внешним evidence. Пока тарифа или полного измерения нет, UI
показывает неизвестную стоимость. Подписка Codex ChatGPT не оценивается
API-тарифом: для неё нужна отдельная обоснованная allocation policy.
Это учёт и оценки, без коммерческого списания денег.

Журнал собирает вызовы, прошедшие через metered runtime платформы. Обычная
работа Codex в IDE автоматически сюда не импортируется. Клиентский scope
показывает `customer_runtime` своей установки; `evaluation` и прочие внутренние
цели доступны только владельцу. Поэтому наличие работы над проектом само
по себе не означает наличие записей в клиентском дашборде.

Для нового Codex thread аналитика использует накопленный `tokenUsage.total`:
один turn может включать несколько обращений к модели. Cached input входит
в input и не прибавляется повторно. Legacy счётчик `run.usage` получает
`tokenUsage.last` и может быть меньше полного расхода turn; источник финансовой
аналитики — ledger с provider observations.

Для приёмки без платных вызовов: `npm run check:usage:postgres` и
`npm run check:usage:browser`. Второй создаёт отдельную БД, два fixture-аккаунта,
web process на `127.0.0.1:3408` и browser evidence в `.ai-workspace/tasks/`;
фоновое AI-исполнение отключено. Production credentials для него не нужны.
Для двух одновременных запусков этот фиксированный порт не предназначен.

Точный охват и будущие порты Model Garden/Router находятся в
[контракте расходов](../specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/25-subscriptions-and-ai-billing.md#257-реализованный-локальный-контур-plat-04).

# Realize — AI CMS

Realize — CMS-платформа с инструментами ИИ для управления и развития сайтов.
Текущий репозиторий реализует интернет-магазин: страницы, каталог товаров,
витрину, корзину и оформление заказов. Контент и данные управляются через
панель Payload Admin. Каждая установка использует отдельное приложение и базу
данных.

Стек: Next.js 16, React 19, TypeScript, Payload CMS 3, Tailwind CSS и PostgreSQL.
Фактические возможности и ограничения описаны в
[контексте проекта](documentation/project-context.md).

## Требования

- Node.js **24.18.0** и npm **11.15.0** — точные версии, проверяемые проектом.
- PostgreSQL; в [Compose](compose.yaml) используется версия **15.18**.
- Docker с Docker Compose — для запуска PostgreSQL или всего приложения в
  контейнерах.

## Локальный запуск

Все команды выполняются из корня репозитория. При использовании собственного
PostgreSQL Docker для локальной разработки не требуется.

### 1. Установка зависимостей

```bash
npm run verify:runtime
npm ci
```

Версия Node.js также указана в `.nvmrc` и `.node-version`.

`npm ci` автоматически применяет патч `@payloadcms/ui` из
`scripts/runtime/patches`: `autocomplete="off"` в SSR кнопок и checkbox предотвращает
восстановление устаревшего `disabled` в Firefox перед hydration
([Payload #17192](https://github.com/payloadcms/payload/issues/17192)).
Патч привязан к точной версии; несовпадение версии или ошибка применения
останавливает установку. При обновлении Payload проверьте reload списка в
Firefox и удалите патч после появления проверенного upstream fix. Если других
патчей нет, удалите также установочный hook и зависимость `patch-package`.

### 2. Настройка окружения

Если `.env` ещё нет, создайте его из шаблона:

```bash
cp .env.example .env
```

В [.env.example](.env.example) заданы локальные адреса и переключатели
возможностей. Перед запуском заполните:

| Переменная                         | Значение                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                | Собственный пароль PostgreSQL                                                 |
| `DATABASE_URI`, `DATABASE_URL`     | Одинаковый адрес БД для локального приложения; по умолчанию `127.0.0.1:55432` |
| `COMPOSE_DATABASE_URI`             | Адрес той же БД из контейнера приложения: `postgres:5432`                     |
| `PAYLOAD_SECRET`, `PREVIEW_SECRET` | Два разных случайных секретных значения                                       |

Имя БД, пользователь и пароль в адресах подключения должны совпадать с
`POSTGRES_DB`, `POSTGRES_USER` и `POSTGRES_PASSWORD`. Зарезервированные символы
пароля в URL необходимо кодировать. Заполните все значения таблицы и для
запуска только PostgreSQL через Compose: он проверяет общий файл конфигурации.

Оставьте `PAYLOAD_DB_PUSH=false`: схема обновляется миграциями. При изменении
адреса сайта согласуйте переменные `NEXT_PUBLIC_*_URL` и `PAYLOAD_PUBLIC_*_URL`.
Файл `.env`, секреты и дампы БД не добавляются в Git.

### 3. База данных и миграции

Для новой локальной БД через Compose:

```bash
docker compose up -d postgres
docker compose ps postgres
```

Дождитесь состояния `healthy`, затем примените миграции. Для собственного
PostgreSQL сначала создайте БД и настройте адреса подключения.

Если существующая БД ранее создавалась через Payload schema push, сначала
следуйте [руководству по миграциям](documentation/delivery/03-migrations-and-rollback.md).

```bash
npm run payload:migrate
```

### 4. Запуск приложения

Для локального окружения в `.env.example` выбран
`REALIZE_AI_RUNTIME_MODE=local-development`. Заполните также
`REALIZE_AI_CONTROL_PLANE_TOKEN`, `REALIZE_AI_EXECUTION_SIGNING_SECRET` и
общий `REALIZE_INTEGRATIONS_ENCRYPTION_KEY` по
[руководству по локальному ИИ](documentation/delivery/01-local-admin-ai.md#2-конфигурация).

```bash
npm run dev
```

Команда запускает Next, Media worker, локальный control plane и execution worker
одним процессом управления. Разрешения AI-этапов задаются в админке; Media worker
обрабатывает штатную очередь Payload независимо от AI. `Ctrl+C` останавливает
окружение, дожидаясь завершения полученных заданий. Повторный совместный запуск
того же checkout и конфликты портов отклоняются; очередь Media дополнительно
защищена единственным исполнителем на БД.

Для запуска только Next используйте `npm run dev:web`. В режиме
`central-control-plane` общая команда запускает приложение и Media worker;
`REALIZE_AI_RUNTIME_ISOLATED=true` исключает всех фоновых исполнителей.
`npm start` не запускает фоновые процессы. Compose включает отдельный
`media-worker`; локальные AI-сервисы в нём не запускаются. Для самостоятельного
Media worker используется `npm run media:worker` после применения миграций;
[жизненный цикл и серверный запуск](documentation/delivery/01-local-admin-ai.md#41-исполнитель-media).

- Сайт: [localhost:3000](http://localhost:3000).
- Панель управления: [localhost:3000/admin](http://localhost:3000/admin).

При первом запуске на пустой БД создайте учётную запись администратора в панели
управления.

## Сборка и запуск в контейнере

Локальная сборка с настроенным окружением и доступной БД:

```bash
npm run build
```

Команда последовательно генерирует типы маршрутов (`next typegen`), проверяет
TypeScript и собирает приложение штатным Webpack в Next.js. Проверка типов завершается отдельным
процессом до начала компиляции; ошибка любого этапа останавливает сборку.

Вариант ниже использует PostgreSQL из Compose с уже применёнными миграциями.
Compose выполняет собственную сборку приложения по Dockerfile. Используйте
окружение, подготовленное выше, и остановите `npm run dev`, чтобы освободить
порт `3000`:

```bash
docker compose up -d --build web
docker compose ps
```

Проект использует режим `standalone`. [Dockerfile](Dockerfile) подготавливает
статические файлы и запускает `.next/standalone/server.js`. Приложение доступно
по тому же локальному адресу. Развёртывание на сервере описано в
[руководстве по сборке и развёртыванию](documentation/delivery/02-ci-release-deploy.md).

## Основные команды

| Команда                              | Назначение                                                       |
| ------------------------------------ | ---------------------------------------------------------------- |
| `npm run dev`                        | Совместный запуск приложения, Media и локальных AI-сервисов      |
| `npm run dev:web`                    | Запуск только Next.js                                            |
| `npm run media:worker`               | Штатные задания обработки Media, один исполнитель на БД          |
| `npm run mcp:serve`                  | Явный запуск внутреннего loopback MCP                            |
| `npm run lint`                       | Проверка кода ESLint                                             |
| `npm run typecheck`                  | Проверка типов TypeScript                                        |
| `npm run check:headers -- <файлы>`   | [Шапки выбранных исходников](.ai/tools/source-headers/README.md) |
| `npm run format:check`               | Проверка форматирования                                          |
| `npm run test:int`                   | Тесты Vitest                                                     |
| `npm run test:e2e`                   | Браузерные тесты Playwright                                      |
| `npm run payload:migrate:status`     | Состояние миграций                                               |
| `npm run payload:migrate:create`     | Создание миграции после изменения схемы                          |
| `npm run payload:generate-types`     | Генерация типов Payload                                          |
| `npm run payload:generate-importmap` | Генерация карты импортов панели управления                       |

Для браузерных тестов нужен Chromium: `npx playwright install chromium`.
Полный список команд находится в [package.json](package.json).

## Дополнительные возможности

- **Внутренний MCP.** В «Настройки → MCP-серверы» доступны экземпляры Realize,
  входящие клиентские ключи, проверка и применение настроек. Отдельный listener
  читает разрешённые Repo/Git/Pages; [запуск и operator profiles](documentation/architecture/mcp-tooling.md).

- **ИИ в панели управления.** Включается на вкладке «Агент» в
  `/admin/integrations/codex` после подключения аккаунта. Там же задаются модели,
  разрешения выполнения и сроки, отображается состояние исполнителя.
  Совместный запуск и отдельные команды обслуживания описаны в
  [руководстве по локальному ИИ](documentation/delivery/01-local-admin-ai.md).
- **Подключения сервисов.** В `/admin/integrations` доступны GitHub и
  [GPT — Codex](documentation/architecture/codex-integration.md): вход через
  ChatGPT в браузере или по коду устройства, API key с отдельной оплатой,
  токен рабочего пространства и серверная идентификация.
- **Локальное подключение Stripe.** Требует заполнения `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` и `STRIPE_WEBHOOKS_SIGNING_SECRET`.
  Для локального приёма событий используется `npm run stripe-webhooks`;
  необходим настроенный Stripe CLI.

## Документация

- [Оглавление документации](documentation/INDEX.md)
- [Структура проекта](documentation/architecture/project-structure.md)
- [Спецификация платформы](documentation/REALIZE_AI_COMMERCE_MASTER_SPEC_v1.0_RU.md)
- [Архитектурные решения](documentation/architecture/decisions/INDEX.md)
- [Инструкции по эксплуатации](documentation/delivery/INDEX.md)
- [Протокол работы ИИ-агентов](AGENTS.md) — обязательный вход в операционный слой
  `.ai` и процедуры `.codex`.

# ADR-0012: Admin integration registry and write-only credentials

## Status

accepted; уточнено 9 сентября 2026 года.

## Context

Изначально GitHub/GHCR release adapter из ADR-0011 получал repository и token из
environment execution worker-а. Такой способ годится для operator bootstrap,
но не даёт администратору управляемого раздела подключений и плохо масштабируется
на GitLab, storage, analytics, payments и другие будущие providers.

Интеграции содержат одновременно browser-safe configuration и secrets. Поэтому
обычный Payload CRUD или передача raw collection document в Admin нарушили бы
правила минимальных DTO и запрет хранения plaintext tokens из security spec.

## Decision

- Payload AI plugin добавляет каталог `/admin/integrations` с квадратными
  карточками сервисов, логотипами, поиском и фильтром «Все / Активные / Неактивные».
  Каталог и настройки занимают ширину контентной области Admin с её стандартными
  отступами; оформление использует [общий UI-кит](../ui-kit.md)
  с адаптацией светлой и тёмной темы Payload.
  Каталог использует реестр реализованных провайдеров; первый — GitHub.
  Активность определяется `connection.enabled`, отсутствие подключения считается
  неактивным. Наличие API token и результат проверки подключения не заменяют
  признак активности;
- настройки открываются по `/admin/integrations/:provider`; карточка является
  доступной с клавиатуры ссылкой, страница настроек содержит возврат в каталог.
  Оболочка получает штатные разрешения и контекст запроса Payload, сохраняя
  боковую навигацию; хлебные крошки задаются через `SetStepNav`.
  Оба маршрута учитывают настроенные пути Admin и интеграций, проверяют
  `canManageIntegrations`; неизвестный провайдер возвращает страницу 404.
  Логотип и представление настроек принадлежат клиентскому реестру плагина,
  конфигурация и подключения передаются существующим безопасным DTO;
- connection хранится в скрытой server-only collection. Общие поля (`provider`,
  `connectionKey`, `enabled`, `configuration`, `revision`, test status) не
  требуют новой таблицы для каждого provider-а. Provider ID остаётся text, а не
  PostgreSQL enum, чтобы расширение каталога не требовало изменения enum;
- provider-specific input, normalization, test и runtime projection принадлежат
  adapter registry. Неизвестный provider fail-closed и не получает generic CRUD;
- credential является write-only. Browser может передать новый token по
  authenticated HTTPS endpoint, но read DTO сообщает только `hasCredential` и
  `credentialUpdatedAt`;
- installation-local vault шифрует credential через AES-256-GCM. Отдельный
  32-byte master key берётся только из
  `REALIZE_INTEGRATIONS_ENCRYPTION_KEY`; ciphertext хранится с versioned envelope
  и authenticated binding к provider/connection. Payload secret не используется
  как fallback;
- без master key создание, замена, проверка сохранённого credential и его
  runtime consumption запрещены. Ключ остаётся operator-owned secret и не
  хранится в Git, Payload или Admin API. SSH-подключение без API token может
  сохраняться и разрешаться для Git без master key;
- каждое save, connection test и disconnect создаёт отдельное redacted audit
  event без repository token и raw provider response;
- GitHub adapter сохраняет canonical HTTPS repository URL как идентичность
  репозитория при обоих Git-транспортах. В существующем `configuration` JSONB
  находятся `transport: "https" | "ssh"` и, только для SSH, `sshProfileRef`.
  Новые таблицы, поля Payload и отдельный vault не нужны. SSH-профиль —
  идентификатор из 1–64 букв ASCII, цифр, `_` и `-`, начинающийся с буквы или
  цифры; это ссылка на конфигурацию исполнителя, а не путь, команда или ключ;
- старые записи без `transport` читаются как HTTPS. Save input без `transport`
  сохраняет текущий транспорт и профиль существующей записи, поэтому старый
  клиент не сбрасывает SSH. Явный SSH требует `sshProfileRef`; HTTPS с профилем
  и неизвестный транспорт отклоняются. Проверка сочетаний общая для
  [API и runtime](../../../packages/ai-contracts/src/parseGitHubIntegrationConfiguration.validator.ts);
- Поля Admin «Имя автора коммитов» и «Email автора коммитов» сохраняются в
  `configuration.commitAuthor: { name, email }`. Общий parser нормализует пробелы,
  ограничивает длину (160/254) и отклоняет неполную пару, недопустимые символы
  и email. Старые записи без автора допустимы: commit требует заполнения
  настроек или явного автора в контексте запуска. В save input отсутствие поля
  сохраняет прежнее значение, `null` очищает пару. Смена автора не меняет токен
  и не сбрасывает результат проверки подключения. Test endpoint сохраняет
  автора при обновлении ветки и статуса проверки. Поля входят в безопасный DTO;
  они не доказывают права пользователя или авторство незакоммиченных изменений;
- `GitCommitAuthorService` получает автора из включённой актуальной записи
  через общий reader, без vault и расшифровки token. Состояния: `absent`,
  `disabled`, `unconfigured` либо `ready` с author, connectionKey и revision.
  Вызывающий Git-загрузчик фиксирует результат до модели; поведение описано в
  [ADR-0016](ADR-0016-development-git-delivery-handler.md);
- HTTPS требует сохранённого или нового token. Для SSH token необязателен и
  может отдельно сохраняться для GitHub REST API; `hasCredential` сообщает
  наличие этого API credential, а не готовность SSH. Поля транспорта доступны
  через существующий API; текущая Admin-форма не предоставляет выбор HTTPS/SSH;
- test endpoint проверяет repository и права token через GitHub REST API,
  не раскрывает token и не сохраняет draft token. Он явно отклоняет отсутствие
  API token. `lastTestStatus: "passed"` и результат теста не подтверждают
  SSH-профиль или возможность SSH push;
- worker-owned source/release consumers загружают включённое primary connection
  только перед GitHub side effect и расшифровывают credential в памяти. Source
  promotion использует credential только через `GIT_ASKPASS`/REST request, а
  release consumer передаёт repository/token только environment дочернего
  orchestrator process. Для release эти значения имеют приоритет над legacy
  `GH_TOKEN`/`REALIZE_AI_GITHUB_REPOSITORY` environment;
- общее серверное чтение принадлежит
  [модулю интеграций](../../../packages/payload-ai-plugin/src/integrations/runtime/integrationRuntime.index.ts),
  экспорт `@realize/payload-ai-control/server/integration-runtime`. Модуль
  принимает существующий `Pool` и ключ, читает актуальную запись при каждом
  вызове и использует общий vault. Он не создаёт соединений с БД и не загружает
  окружение. Состояния `absent`, `disabled`, `ready` и серверный результат
  подключения сохранены; решение о допустимости отсутствующей записи остаётся
  у потребителя. Ошибки сохранённой конфигурации блокируют операцию, а сбой БД
  возвращает безопасную ошибку чтения без деталей драйвера;
- `GitHubConnectionService.resolvePrimaryGitHub()` сохраняет REST-контракт
  с обязательным token для source/release. Отдельный
  [GitRepositoryConnectionService](../../../packages/payload-ai-plugin/src/integrations/runtime/GitRepositoryConnection.service.ts)
  возвращает `absent`, `disabled` либо `ready` с `connectionKey`, `revision`,
  `repositorySlug`, canonical `repositoryURL` и HTTPS token или SSH profile.
  SSH-ветка не расшифровывает credential и не требует vault. Закрытые данные
  получает серверный обработчик; SSH destination и профиль разрешаются
  исполнителем по [ADR-0016](ADR-0016-development-git-delivery-handler.md);
- для release consumer legacy environment остаётся временным bootstrap
  fallback, если connection ещё не создан. Сетевая Git-доставка рабочего слоя требует
  включённого подключения из БД и не использует этот fallback. Остальные
  executable paths, workflow name, timeouts и provider infrastructure остаются
  конфигурацией исполнителя под управлением оператора;
- доступ к UI и каждому endpoint проверяется отдельным installation-owned
  `canManageIntegrations`; page-level проверка не заменяет endpoint authorization.

## Consequences

- добавление нового provider-а требует descriptor, строгого input parser,
  server adapter, safe DTO mapper и UI renderer, но не нового secret field и не
  raw Payload CRUD;
- database dump содержит ciphertext, но его всё равно нужно защищать; компрометация
  одновременно DB и master key раскрывает credentials;
- ротация master key и внешний managed secret store требуют отдельного adapter-а
  и migration procedure до multi-host production rollout;
- текущий GitHub token должен быть repository-scoped и иметь только права,
  необходимые source promotion из ADR-0013 и candidate/workflow adapter-у;
- production deployment credentials по-прежнему не попадают в этот registry и
  остаются у отдельного Deployment Controller.

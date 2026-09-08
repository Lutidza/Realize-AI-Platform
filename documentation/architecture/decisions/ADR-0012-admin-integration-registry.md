# ADR-0012: Admin integration registry and write-only credentials

## Status

accepted

## Context

GitHub/GHCR release adapter из ADR-0011 сейчас получает repository и token из
environment execution worker-а. Такой способ годится для operator bootstrap,
но не даёт администратору управляемого раздела подключений и плохо масштабируется
на GitLab, storage, analytics, payments и другие будущие providers.

Интеграции содержат одновременно browser-safe configuration и secrets. Поэтому
обычный Payload CRUD или передача raw collection document в Admin нарушили бы
правила минимальных DTO и запрет хранения plaintext tokens из security spec.

## Decision

- Payload AI plugin добавляет отдельный custom Admin view `/admin/integrations`
  и provider-neutral catalog. Первый доступный adapter — GitHub source control;
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
  хранится в Git, Payload или Admin API;
- каждое save, connection test и disconnect создаёт отдельное redacted audit
  event без repository token и raw provider response;
- GitHub adapter принимает canonical HTTPS repository URL, проверяет доступ
  server-side через GitHub REST API и сохраняет только normalized repository
  metadata. Test endpoint не раскрывает token и не сохраняет draft token;
- worker-owned source/release consumers загружают включённое primary connection
  только перед GitHub side effect и расшифровывают credential в памяти. Source
  promotion использует credential только через `GIT_ASKPASS`/REST request, а
  release consumer передаёт repository/token только environment дочернего
  orchestrator process. Для release эти значения имеют приоритет над legacy
  `GH_TOKEN`/`REALIZE_AI_GITHUB_REPOSITORY` environment;
- общее серверное чтение принадлежит
  [IntegrationRuntimeRepository](../../../packages/payload-ai-plugin/src/integrations/runtimeRepository.ts),
  экспорт `@realize/payload-ai-control/server/integration-runtime`. Модуль
  принимает существующий `Pool` и ключ, читает актуальную запись при каждом
  вызове и использует общий vault. Он не создаёт соединений с БД и не загружает
  окружение. Состояния `absent`, `disabled`, `ready` и серверный результат
  подключения сохранены; решение о допустимости отсутствующей записи остаётся
  у потребителя. Ошибки сохранённой конфигурации блокируют операцию, а сбой БД
  возвращает безопасную ошибку чтения без деталей драйвера;
- legacy environment остаётся временным bootstrap fallback, если connection ещё
  не создан. Остальные executable paths, workflow name, timeouts и provider
  infrastructure остаются operator-owned environment, а не editable Admin
  settings;
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

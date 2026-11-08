# Доступы пользователей и инструментов

Ниже описана действующая авторизация Task Manager. Отдельный
[контракт ENG-05](#единые-инженерные-полномочия-eng-05) задаёт целевое расширение
для IDE, Admin и GPT; он не означает выдачу прав или внедрение OAuth.

Статус: current implementation, локально активирована 19 октября 2026 года.
M34 применена к рабочей БД; web использует сборку `Dfi6Wz9am3HM5TVk5N8El`.
Канонический адрес установки — `http://localhost:3000`. Реальная PostgreSQL
и полная browser/CLI приёмка выполнены на отдельных fixtures. После live activation
проверены health, запрет доступа без входа и создание/отмена собственного device
request. Полный вход CLI под учётной записью пользователя на рабочей установке
не выполнялся: ручной вход в отдельном браузере не был завершён.

## Владельцы и границы

`packages/payload-access-management` владеет публичными DTO, выдачей и отзывом
доступов, device authorization и обновлением CLI-сессии. Payload/PostgreSQL —
источник состояния. Host настраивает Users, допуск администратора, проверку
владельца платформы и фиксированный public URL. Task Manager потребляет
endpoint-local проверку доступа; глобальная auth strategy Users не добавляется.

`/system/access` — единый центр. Карточка Users содержит ссылку с ownerId;
секреты сессии браузера не отображаются. Пользователь создаёт доступ только
от своего имени, видит и отзывает свои доступы. Владелец платформы может
читать и отзывать чужие доступы, но не выпускать секрет от имени другого лица.
MCP сохраняет существующего владельца ключей; центр даёт переход к его управлению.
Внешние provider credentials, browser JWT и machine infrastructure secrets
не копируются в новый каталог.

## Типы и права

- personal/API: случайный непрозрачный bearer; срок 1..365 дней, default 30.
- CLI: bearer на 15 минут и rotating refresh credential; абсолютный срок
  подключения 90 дней. Повторный login создаёт новое явно подтверждённое подключение.
- Scopes: `task-manager:read`, `task-manager:write`, `task-manager:projects`.
  Read обязателен. Write разрешает изменения задач/списков и Git observation sync;
  projects — создание/изменение проектов и membership. Прежние owner/member ACL
  применяются дополнительно; scopes не предоставляют release, AI или Git write.
- Scopes регистрируются у общего владельца; wildcard/full-admin access отсутствует.
  Право пользователя и состояние токена перечитываются на каждом обращении,
  включая повторную авторизацию внутри task mutation transaction.

Сервер сохраняет только hashes 256-bit случайных secrets. Access token имеет
формат `rza.<uuid>.<base64url-secret>`, refresh — `rzr.<uuid>.<base64url-secret>`.
Публичный DTO: `id,name,kind,ownerId,scopes,prefix,createdAt,expiresAt,
accessExpiresAt,lastUsedAt,revokedAt,status`; kind=personal|api|cli,
status=active|expired|revoked. Prefix не содержит секретной части.
Browser creation/CLI exchange возвращают секрет только в текущем no-store ответе.
Повторное чтение и журналы содержат только metadata. Прямой collection CRUD,
GraphQL и Local API без доверенного service context не открывают hashes/secrets.

## HTTP contract `/api/access`

Все ответы `{ok:true,data}` или `{ok:false,error:{code,message}}`, no-store,
без raw исключений и reflected credentials. JSON body bounded. Browser management
принимает только настоящую Users cookie session, отвергает Authorization;
мутации требуют Origin, совпадающий с настроенным public URL, и JSON content-type.

| Метод/путь | Вход | Успех data |
| --- | --- | --- |
| GET `/context` | — | `{actor:{id,name},canManageOthers,scopes:[{id,label,description}]}` |
| GET `/tokens` | ownerId?, after? | `{items:AccessTokenDto[],nextCursor:string|null}` |
| POST `/tokens` | `{name,kind:personal|api,scopes,expiresInDays}` | `{token:AccessTokenDto,secret}` |
| POST `/tokens/:id/revoke` | `{}` | AccessTokenDto, повтор idempotent |
| POST `/device` | `{clientName,scopes}` | `{deviceCode,userCode,verificationUri,expiresIn:600,interval:5}` |
| GET `/device` | userCode | `{userCode,clientName,scopes,expiresAt,status}` |
| POST `/device/decision` | `{userCode,decision:approve|deny}` | тот же DeviceRequestDto |
| POST `/device/token` | `{deviceCode}` | `{status:authorization_pending|slow_down|access_denied|expired_token|consumed|issued,interval:number,credential:CredentialBundle|null}` |
| POST `/device/cancel` | `{deviceCode}` | `{cancelled:true}` |
| POST `/session/refresh` | `{refreshToken}` | CredentialBundle |
| POST `/session/logout` | `{refreshToken}` | `{revoked:true}` |
| GET `/session` | Bearer | `{actor:{id,name},token:AccessTokenDto|null}` |

CredentialBundle: `{accessToken,refreshToken,accessExpiresAt,expiresAt,
token:AccessTokenDto,actor:{id,name}}`.

Device start/token/cancel и refresh/logout не требуют браузерной сессии:
право подтверждается соответствующим высокоэнтропийным секретом. Device GET и
decision требуют cookie session; GET никогда не подтверждает доступ.
Verification URI — фиксированный `/system/access/device`, без device secret в URL.
User code показывается CLI и вводится/сверяется человеком в браузере.

Start ограничивает скорость/число живых запросов через общее DB состояние;
user-code lookup ограничен по пользователю. Короткий код не является bearer.
TTL — 10 минут, poll не чаще пяти секунд, throttle увеличивает interval.
Approve/deny/consume/cancel и создание token выполняются атомарно под locks.
Одно подтверждение не может породить несколько действующих CLI credentials.
Cancel может отозвать уже выпущенный credential того же device request в пределах TTL.

Refresh атомарно заменяет access/refresh hashes. Повтор прежнего refresh после
ротации отзывает подключение (reuse detection); неизвестный исход обмена требует
нового login. CLI не делает автоматический повтор неоднозначного refresh и
сериализует refresh одного подключения между процессами. Сервер не хранит
зашифрованные replay copies секретов. Отзыв не зависит от срока bearer и
становится видимым следующему запросу. Смена прав/удаление пользователя также
закрывает доступ. Logout допускает отзыв через current/previous refresh.

Перед refresh POST CLI устойчиво записывает несекретный `refresh-pending` marker
под connection lock. Crash или потеря ответа оставляют marker; следующий процесс
не повторяет старый refresh и требует нового login. История использованных hashes
позволяет выявить повтор любого прежнего refresh до окончания срока подключения.
Исключение — доказанный отказ до установления соединения (`ECONNREFUSED`,
`ENOTFOUND`, `EHOSTUNREACH`, `ENETUNREACH`): сервер не мог принять refresh,
поэтому CLI снимает marker и сохраняет подключение. Task preflight отдельно
подтверждает offline для локального резерва; восстановившийся сервер с HTTP 401
не даёт права на fallback. Timeout и неизвестный исход не относятся к исключению.

## CLI

`login [--url <Task Manager API URL>] [--name <label>] [--no-browser]`,
`logout [--url ...]`, `auth-status [--url ...]` выполняются без локального TASK.
URL берётся из явного flag, окружения либо выбранного локального подключения;
отдельные установки не получают credentials друг друга. Project/list не являются
частью подключения. `REALIZE_TASK_MANAGER_TOKEN` остаётся явным override.
Env token связан с обязательным env URL: другой `--url` в `auth-status`
отклоняется до HTTP, даже если для второй установки уже есть keyring credential.

Login проверяет keyring до запроса, открывает verification URI и выводит
human code. Device secret и issued credentials проходят только через память
и приватные pipes. После успешного обмена credential сохраняется в системном
хранилище до сообщения об успехе; ошибка сохранения вызывает remote cancellation.
Deadline, SIGINT/SIGTERM и polling errors завершают процесс и bounded cleanup.
Если credential уже получен, но срок ожидания истёк или сохранение отменено,
CLI также запрашивает отзыв через refresh, чтобы TTL device request не мешал cleanup.

Linux использует Secret Service/libsecret через фиксированный Python GI helper;
token не передаётся в argv, shell, Git, TASK или логи. Не секретные URL/config и
refresh lock находятся в `$XDG_STATE_HOME/realize/task-workspace-access` либо
`~/.local/state/realize/task-workspace-access`, вне checkout. Каталог имеет права
0700, config — 0600; credentials в этих файлах отсутствуют.
Недоступное хранилище даёт явную ошибку, без plaintext fallback. CLI забирает
credentials по нормализованному URL, обновляет истекающий bearer автоматически,
проверяет online status и отзывает подключение при logout. Env override не
выдаётся за удалённую переменную вызывающего shell. Поддержка других OS
обозначается только после реализации и соответствующих проверок.

## Проверки и источники

Нужны DTO/ACL/CSRF/scope tests; изолированный PostgreSQL для concurrent
approve/consume/refresh/revoke и rollback; CLI tests для keyring failures,
refresh serialization, cancellation, opaque errors и отсутствия секретов;
браузерные сценарии create/show-once/reload/revoke и device approve/deny,
включая keyboard/mobile. Миграция и generated types обновляются штатно.
Рабочая БД не используется для disposable acceptance.

Выполнены 11 PostgreSQL access-сценариев (полная миграция M1–M34, пустой down/up,
populated rollback, concurrent consume/refresh/revoke, cookie admission и ACL),
26 PostgreSQL regression-сценариев Task Manager, адресные server/CLI/UI tests,
TypeScript и lint. Настоящий Chromium прошёл create/copy/hide/reload/revoke,
approve/deny, keyboard/mobile и CLI login → Secret Service → auth-status →
projects → logout. Browser evidence не содержит plaintext credentials.
Исходный CLI набор прошёл 366 проверок; последующие security fixes проверены
адресно, без заявления о новом полном прогоне. Команды повторения:

```bash
npm run check:access:postgres
TASK_BROWSER_TASK=.ai-workspace/tasks/<managed-key> npm run check:access:browser
npm run check:task-workspace
npm run typecheck
```

Миграция `20261019_085743_platform_access` и generated types/importMap созданы
штатными Payload generators. Адресный live apply добавил receipt в batch 21;
все 31 прежние receipts и existing schema сохранены. Перед apply создан и полностью
прочитан private backup вне checkout, без заявления о restore proof.
Production build прошёл штатные typegen, TypeScript и Next на Node 24.18.0/npm 11.15.0.
Перезапущен только web; прежний пакет сохранён. Откат заполненного хранилища блокируется; подробности
в [migration runbook](../delivery/03-migrations-and-rollback.md).

Протокол device flow опирается на [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628),
но HTTP envelope проекта не заявляется универсальным OAuth authorization server.
Хранение и lifecycle сверяются с [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html),
browser mutations — с [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Единые инженерные полномочия ENG-05

Версия целевого контракта: **1.1**, 2026-10-25, TASK-63 / ENG-05.
`accepted-as-target`; реализация, миграция и приёмка клиентов ещё не выполнены.
Основания: [ADR-0019](decisions/ADR-0019-shared-engineering-operations.md),
[контракт артефактов](engineering-artifacts.md) и
[lifecycle задач ENG-04](../specifications/task-management-execution.md#15-целевой-контракт-задач-eng-04).

### Проверенное состояние и владельцы

| Контур            | Существующий допуск                                                                                                   | Что требуется добавить                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Access Management | Users, три `task-manager:*` scope, personal/API/CLI credentials, device login, refresh/revoke; закрытый CRUD.         | Версии client binding/grant, целевые scopes, OAuth adapter, отзыв связанного набора credentials.     |
| Admin owner-host  | Текущий владелец, deployment gates, HMAC на run/actor/profile/context hash/root, TTL один час.                        | Связь с действующим grant и отзывом; новый typed admission отдельно от native turn.                  |
| Managed MCP       | Client principal, пересечение current/applied grants, tool allowlist, host profile и при необходимости Payload actor. | Персональный actor внешнего клиента и domain authorization инженерных операций.                      |
| Bootstrap MCP     | Доверенный developer principal из окружения, repository read без Payload identity.                                    | Сохранить нынешний read-only контракт; права записи не добавлять автоматически.                      |
| IDE/CLI           | Локальные OS-права; отдельное подключение Task Manager через keyring/device login.                                    | Явно различать local и remote target; общий typed executor без обязательной БД для локальных файлов. |

Managed Workshop уже имеет собственные write/preview tools. Это не право записи
checkout. Общий tunnel credential с `actorBinding=self` представляет выдавшего
его пользователя, а не удостоверенную личность каждого участника ChatGPT.
Прежние Workshop grants не мигрируют в engineering grants.

Единственный владелец пользовательских credentials, client bindings, выдачи и
отзыва grants — `packages/payload-access-management`. Users остаётся источником
личности; Task Manager владеет membership/acceptance/policy ACL. MCP управляет
своими instances, транспортом и каталогом; control plane — host admission и
процессами. Git и deployment сохраняют своих исполнителей и approvals.
Не создаются второй каталог пользователей или глобальная Users auth strategy.

### Доверенная identity и grant

Модель передаёт намерение операции и идентификаторы объектов. `actorId`,
`isOwner`, grant, root, scopes и `authorized` из аргументов инструмента не
принимаются как доказательство. Сервер строит внутренний authorization context:

| Объект              | Обязательные привязки и правила                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor               | `kind=platform_user` и актуальный Users ID; локально `kind=local_os` с host/user. Исторический author не является действующим actor.                                                                                             |
| Client binding      | `id`, installation, проверенный transport/client identity, owner actor, active/revoked state и revision. Подпись `clientName` не удостоверяет клиент. OAuth `client_id` определяет приложение, не человека.                      |
| Access grant        | `id`, revision, actor, client binding, audience, разрешённые actions/scopes, targets, issued/expiry/revocation, issuer и ссылка на исходное разрешение. Непустые конечные allowlists, без wildcard/full-admin scope.             |
| Target binding      | Installation ID, machine/host ID, workspace ID и canonical root из доверенной настройки; для задач — project IDs. Root change/rebind меняет revision. Project/list выбираются среди разрешённых, не фиксируются глобальными env. |
| Operation admission | Короткий внутренний допуск к `operationId`/attempt/plan hash, actor/client/grant revision, target revision, policy revision, audience исполнителя и deadline. Не является публичным bearer или правом нового действия.           |

Итоговое разрешение — пересечение действительных credentials, grant, актуальных
прав пользователя, target/host policy, domain ACL и разрешённой области задания.
Для remote/server source/instruction/command/host/deploy операций первая поставка
сохраняет **platform-owner-only** admission. Task operations сохраняют текущий
admin/member admission; проектный owner не становится владельцем платформы.
Read-only repository principals продолжают свой отдельный текущий маршрут.

Пути операции относительны выбранному workspace. Сервер сверяет canonical root,
границы путей и symlink по файловому контракту перед эффектом; переданный
клиентом абсолютный путь не выбирает серверную машину. Symlink/mount/root drift
останавливает зависимую операцию. В явном local режиме OS authority остаётся
локальной: она не удостоверяет Payload user и не выдаёт удалённые права.
Локальный typed executor допускается по OS actor и trusted workspace policy
без Payload owner/БД; action/path/artifact guards общего core сохраняются.
Локальная квитанция явно содержит `local_os`, не подменяет platform admission
и не разрешает удалённые task/Git/deployment действия от имени Users.
Отказ remote auth не переключает запрос на local mode или bootstrap.

### Матрица scopes и предметных прав

Следующие имена — целевой registry общего владельца, не действующие enum.
Scope не подразумевает остальные scopes; для чтения данных нужен соответствующий
read scope. Более узкие actions/targets задаются grant. Одинаковые проверки
действуют для IDE remote, Admin typed и GPT, без специального обхода для UI.

| Действие                                                                                                   | Scopes и дополнительные условия                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Читать checkout, инструкции, plan и разрешённый journal                                                    | `engineering:read`; target/path policy; содержимое связанных задач — отдельно по Task ACL.                                                                                                                              |
| Создать/edit/move/delete авторский файл или папку                                                          | `engineering:files:write` + `engineering:read`; разрешённые paths/actions, versioned plan, artifact/folder policy. Delete не следует из grant только на edit.                                                           |
| Менять AGENTS, `.ai`, `.codex` и инструкции                                                                | Предыдущее + `engineering:instructions:write`; исходники generated metadata меняются у владельца. Изменение инструкции не меняет grant.                                                                                 |
| Запустить зарегистрированный генератор                                                                     | `engineering:generate` + разрешение записи каждого output, включая instruction scope при соответствующем output; закреплённые generator/version/inputs/outputs и execution policy.                                      |
| Запустить check или зарегистрированную команду                                                             | `engineering:commands:run` + права declared effects; точный command profile, bounds и версия исполняемого содержимого. Read scope не разрешает выполнение тестового кода.                                               |
| Native shell, пользовательские службы и работа с машиной                                                   | `engineering:host:run`; отдельный owner-host admission, конкретная машина/OS user и явно выбранный native режим. Это полный OS-доступ, см. границу ниже.                                                                |
| Task/project/list read, разрешённые результаты/история                                                     | Существующий `task-manager:read` + current и historical ACL.                                                                                                                                                            |
| Task metadata, lifecycle E, results, relations/order, move внутри проекта                                  | Существующий `task-manager:write` + read, членство E и guards ENG-04; scope не обходит критерии close/reopen.                                                                                                           |
| Принять/отклонить результат, accept+close                                                                  | Новый `task-manager:accept` + read; роль A, текущие evidence/criteria/policy и independence requirement. Для совмещённого close дополнительно write и роль E.                                                           |
| Policy, делегирование A/O, close cancelled/exception, межпроектный move, archive/restore Task/List/Project | Новый `task-manager:govern` + read и права O с guards ENG-04; move также write и O обеих сторон. Политика проекта требует projects scope; обычный lifecycle E остаётся write.                                           |
| Создать проект                                                                                             | Существующий `task-manager:projects` + read и текущий admin admission; создатель становится owner/member нового проекта.                                                                                                |
| Менять metadata/membership проекта                                                                         | Существующий `task-manager:projects` + read и owner существующего проекта. Новый scope govern нужен только новым policy/делегированию/архиву, не прежнему metadata API.                                                 |
| Читать Git                                                                                                 | `git:read` для нового engineering клиента; прежний repository-read MCP остаётся прежним.                                                                                                                                |
| Git manage/fetch/pull/commit/push/merge                                                                    | Отдельный `git:manage`, `git:fetch`, `git:pull`, `git:commit`, `git:push` или `git:merge` + read; точные поддействия, repository/ref/remote/approved tree и проверки существующего Git owner. Commit не разрешает push. |
| Deployment/активация                                                                                       | `deployment:execute`; отдельные environment/release/approval и действующий delivery owner. File write, Git push и роль владельца сами по себе не являются разрешением deployment.                                       |

`A` по умолчанию — владелец проекта или назначенный принимающий; `O` — owner
либо действующий делегат определённого действия. Делегирование хранится
предметным владельцем с actor/action/target/expiry/revision, ограничено правами
выдавшего и не транзитивно. Grant/token также должен разрешать действие.
Удаление пользователя/членства/делегирования закрывает следующий admission.
Ни назначение assignee, ни роль в prompt, ни статус review не создают полномочия.
В первой поставке не вводится обязательный второй LLM для приёмки.

Access management остаётся настоящим browser management с текущими cookie/Origin
guards. Пользователь выдаёт доступ от своего имени, platform owner может отзывать
чужой, но не выпускать его от чужого имени. Tools инженерного агента не получают
универсального `access:admin`. Выдача/расширение grant — отдельное действие
пользователя в центре доступов; сужение/отзыв не требует переиздания проекта.
Сохранённое разрешение на работу переиспользуется в его точной области, без
повторного согласования каждого файла. Новые target/actions/срок или delivery
требуют расширения разрешения; metadata модели не является таким расширением.

### Персональное подключение GPT

Выбран OAuth authorization-code flow с PKCE `S256`, персональным входом через
Users и явным разрешением подключения. MCP публикует resource metadata,
authorization server — issuer/endpoint metadata; audience/resource, scope,
срок и identity проверяются сервером. Redirect URI берётся точно из настроек
клиента, без wildcard; одноразовый code привязан к client, redirect, resource
и PKCE. Tool metadata/security schemes и auth challenges согласованы.
Это соответствует [официальному контракту OpenAI](https://developers.openai.com/plugins/build/auth),
проверенному 25 октября 2026 года; наличие схемы ещё не подтверждает работу
реального клиента.

Для первой поставки выбирается заранее зарегистрированный OAuth client;
метод token endpoint auth закрепляется его конфигурацией и проверяется с GPT.
Динамическая регистрация и CIMD не требуются первой поставке. Возможность
преднастроенных credentials описана в
[подключении custom MCP](https://developers.openai.com/api/docs/guides/custom-mcp-server).
OAuth protocol adapter использует поддерживаемую библиотеку и существующий
access owner, а не собственную криптографию или копию пользователей. Выбор
библиотеки с версией и проверка её MCP/OAuth поведения входят в реализацию.

Browser consent показывает установку, приложение, пользователя, цели, действия,
срок и возможность отзыва. Связь grant → client binding → Users возникает после
серверно проверенного входа/consent, не из email, названия чата или tunnel key.
Чужое authorizing account нельзя подставить аргументом tool. Client credentials
или транспортная аутентификация приложения не подменяют user authorization.
Публичные metadata не раскрывают проекты, абсолютные roots или список секретов.

Tunnel остаётся транспортом. Его supervisor должен сохранить персональный
OAuth context до resource server; текущая подстановка общего bearer для нового
write route недопустима. Если этот путь нельзя подтвердить, инженерный write
через него закрыт; возможен отдельно настроенный HTTPS route с тем же owner.
Доступность metadata/authorize/token для соответствующих участников потока
проверяется отдельно: доступный localhost MCP не доказывает готовность OAuth.
Legacy route и его права сохраняются, ошибки OAuth не дают fallback в него.

### Срок, отзыв, replay и длительные операции

Целевой default: user access token до 15 минут; client grant до 90 дней с
возможностью меньшего срока; operation admission до 5 минут и не позже grant.
Длительный native run сохраняет ограничение максимум один час и обновляет
свежесть допуска отдельно, не продлевая исходное разрешение автоматически.
Это параметры нового режима, не изменение сроков старых personal/API/CLI токенов.
Secrets хранятся защищённо и выдаются только предусмотренными ответами
issuance/exchange/refresh по защищённому каналу с `no-store`. Последующее чтение,
metadata DTO, audit и logs содержат только IDs, revisions и safe metadata.

На каждом вызове, выдаче replay/result и непосредственно перед mediated эффектом
проверяются actor, grant/client/target revisions, отзыв/expiry и domain ACL.
Признанный credential с ошибкой не откатывается к cookie/другому principal.
Новый endpoint не использует один `req.user` без проверки credential scope.
MCP сохраняет повторный admission перед dispatch; его registry не копирует
авторизационную логику domain owner. Общий discovery сообщает доступность,
но не предоставляет право и не доказывает целиком доступность target.

Отзыв credential закрывает его; отзыв grant закрывает все связанные credentials
и renewals; отключение client binding — все его grants. Смена прав пользователя
и host policy проверяется тем же путём. Несекретная история и авторство остаются.
Результат прежней операции не переисполняется при replay, но доступ к нему
проверяется заново, включая historical ACL после task move. Отзыв не отменяет
уже совершённый эффект и не удаляет audit.

Grant/revoke и domain mutation получают совместимый порядок locks; access
проверка присоединяется к существующей транзакции, не открывает вложенную.
Для DB эффекта отзыв, закоммиченный до authorization linearization, блокирует
его. Уже допущенный эффект может завершиться; граница фиксируется в журнале.
Файловая запись/Git/внешний процесс не являются общей транзакцией с Payload:
[Протокол ENG-06](engineering-operations.md) фиксирует admission point,
reservation, отказ и recovery, без обещания
мгновенного отзыва уже исполняющейся инструкции CPU или сетевой операции.

Для новых длительных запусков нужны сигнал отзыва/expiry и lease с максимальной
свежестью 30 секунд; потеря связи запрещает продление и новые действия. Runtime
посылает cancel при отзыве, не позже expiry lease, и подтверждает остановку
управляемых descendants; UI различает `revoked`, `cancelling`, `stopped` и
`stop_unconfirmed`. Bounded heartbeat принадлежит runtime, без LLM polling.
Служебное прекращение процесса разрешено доверенному runtime после отзыва;
новые rollback/recovery записи требуют отдельного действительного допуска.
Остановленный или неизвестный процесс не считается успешно принятым результатом.

Refresh OAuth имеет отдельную versioned policy: rotation/reuse detection и
неоднозначный exchange требуют проверки с реальным клиентом. Нельзя молча
переносить CLI retry assumptions на GPT. Неизвестный результат обмена не даёт
права повторного выпуска; до подтверждённой безопасной retry policy — повторный
вход. Старый CLI refresh protocol, hashes и история reuse сохраняются.

### Агентский слой, генераторы и native граница

AGENTS, `.ai`, `.codex`, compiled prompts и project registry описывают работу
в пределах допуска. Они не могут выдавать grant или менять trusted host policy.
Runtime authority хранится у access/host owners вне редактируемых инструкций.
Правка policy descriptor/package script не активирует новую команду: trusted
execution profile связывает executable, runtime, аргументы, зависимости и
исполняемые исходники/хуки; изменённые значимые bytes инвалидируют допуск.
ENG-06 определяет manifest и замораживание входов. При невозможности ограничить
эффекты команда доступна только явно допущенному native owner-host.

Изменение исходников auth/исполнителя разрешается как изменение кода; оно не
выпускает новый credential и не считается активацией security policy. Reload,
rebuild/deploy или смена trusted config проходят отдельный разрешённый путь.
Для удалённого typed режима исполняемый auth/host runtime и его secrets должны
быть изолированы от writable checkout; иначе режим нельзя объявлять enforcement
boundary. Само разделение TypeScript modules не создаёт изоляции ОС.

Native owner-host сохраняет полные права своего непривилегированного OS user
и может обходить файловые API через shell. Ни root в grant, ни watchers,
ни правила prompt не изолируют его от других доступных пользователю файлов.
Начальный native admission явно показывает эту границу; неизвестные detached
процессы не объявляются остановленными. Typed ограничения применяются только
к mediated операциям. Запуск root отвергается; `sudo` требует отдельного
разрешения задания. Внешние/native изменения отмечаются observed, не получают
поддельный executor receipt или автоматически доказанное авторство.

### Совместимость и внедрение

1. Сохранить legacy access/device/session DTO и три scopes; strict enum нельзя
   расширять для старых clients. Новый management DTO/versioned registry —
   `/api/access/v2`, `schemaVersion=2`; стандартные OAuth endpoints имеют свой
   protocol envelope. V1 listing содержит только legacy credentials, v2 — все
   виды; этот предел явно описывается клиентом. V1 mutation нового credential
   отклоняется как unsupported/upgrade-required, без ложной проекции scope.
2. Разделить storage decoder и transport schema. Expand/backfill сохраняет IDs,
   owner, hashes, сроки, revoke/refresh history; новые records имеют версию.
   Старые credentials не получают новые grants, OAuth kind или engineering scope.
   `/session token:null` для прежнего JWT не трактуется как full access.
3. Добавить server-side client/grant lifecycle с CAS и связью credentials,
   затем scoped domain admission. Новые create/consent связывают policy revisions;
   неизвестный actor/client/audience закрывает write. Старый HMAC run grant
   проверяется прежним handler. Сервер различает `legacy-native`, `native-v2`
   и `typed-v2` отдельными version/domain и routes; discriminator не выбирает
   модель. Только legacy сохраняет прежний HMAC TTL/cancel без обещания отзыва
   за 30 секунд. Native-v2 требует grant ID/revision и проверяемый lease.
   Переключение issuance выполняется явной активацией на installation/client;
   после неё отказ v2/отзыв не выпускает legacy HMAC для продолжения задания.
   Старые runs завершаются в своём режиме с явной диагностикой покрытия.
4. Согласовать OAuth issuer/resource и gateway, внедрить адаптеры IDE/Admin/GPT,
   затем проверить отзыв/отключение/expiry, concurrent refresh и сохранение
   чужих правок. Bootstrap и старый tunnel не автоматически повышаются.
5. Включать capabilities только после реальных checks. Миграция проверяется на
   пустой и заполненной isolated DB, включая restart и replay; destructive down
   и запуск старого binary после новых записей блокируются. Пользовательские
   токены, БД и работающие сессии этим проектированием не изменяются.

Центр доступов показывает пользователя, клиент, targets/actions, expiry/status,
последнее использование и отзыв подключения. Секрет после выдачи не перечитывается.
Проектная membership/acceptance delegation остаётся в своём domain. Ни UI, ни
общий grant не создают параллельную систему проектов, задач или approvals.

### Сценарии приёмки будущей реализации

| Сценарий                                                       | Требуемый результат                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Одинаковая typed операция из IDE remote/Admin/GPT              | Один domain decision и исполнитель; одинаковые target/scope guards, разные доверенные входы.                                      |
| Два пользователя одного ChatGPT подключения                    | Разные Users/grants; второй не наследует владельца tunnel. Legacy shared credential не вызывает engineering write.                |
| Подмена actor/root/resource/client, неверный PKCE или redirect | Отказ до эффекта; нет fallback к cookie, bootstrap или local OS.                                                                  |
| Scope есть, но actor не owner или потерял membership/A/O       | Отказ; revoked/deleted/expired identity не восстанавливается receipt или историческим assignee.                                   |
| File write без instruction/generator/Git/deploy authority      | Соответствующее новое действие отклонено, прежние разрешённые edits продолжаются.                                                 |
| Правка AGENTS, workflow, MCP config или package script         | Полномочия не расширены; изменившийся execution profile требует нового trusted admission.                                         |
| Revoke одновременно с queued apply/replay/lease renewal        | Ни нового admission после отзыва, ни закрытого результата в replay; уже начатая часть и stop status отражены честно.              |
| Потеря связи или остановка native run                          | Нет бесконечного renewal/LLM polling; stop_unconfirmed не выдаётся за sandbox или остановку detached writers.                     |
| Отзыв native-v2 после переключения issuance                    | Renewal закрыт, cancel запрошен; продолжение через legacy-native/HMAC запрещено. Legacy run не объявляет реализованным v2 revoke. |
| Перенос task с private history/accepted result                 | Current + historical ACL, O обоих проектов и guards ENG-04; исходные grants/approvals не переносятся.                             |
| Legacy CLI/device/JWT/MCP и заполненная БД                     | Прежние scopes/refresh/DTO сохраняются; capabilities не объявляют невнедрённую запись.                                            |
| Concurrent OAuth exchange/refresh/revoke и restart             | Нет двух незаметно выданных доступов или повторной записи; unknown outcome остаётся явным.                                        |

Это план проверок, не выполненные runtime tests. [ENG-06](engineering-operations.md)
задаёт DTO операций, lock/admission/recovery protocol и точные budgets; ENG-07/18/21–23 внедряют
соответствующих владельцев и клиентов, ENG-28–30 подтверждают сквозное поведение.

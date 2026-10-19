# Доступы пользователей и инструментов

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

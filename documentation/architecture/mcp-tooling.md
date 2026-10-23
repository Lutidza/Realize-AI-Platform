# MCP tooling

- **Статус:** A+G+S1, предустановки, managed Workshop и локальная подготовка ChatGPT C; облачная приёмка C ожидается, 26 сентября 2026 года
- **Source of truth Codex adapters:** `.codex/config.toml`
- **Уточнение 20 октября 2026 года:** MCP `1.3.1`, context `1.1` и раздельная диагностика filesystem/Git подтверждены ответами bootstrap и Realize AI ChatGPT connector. Через connector также проверены status/diff, файлы, capability discovery и S1 instructions; полная приёмка установленных consumers поиска этим не заменяется.
- **Текущий результат TASK-52, 22 октября 2026 года:** по разрешению пользователя создан локальный commit `9499902416cbd3bd799e9c759a122165d858641e` ровно из 16 файлов; 65 прежних изменений сохранены вне commit, push не выполнялся. После production build и canary активирована сборка `UC_Xr0YB_MtdFGCmWICbt`, sourceVersion `689993ddd5ec2027534650e504adf60f3e3ace90edbe0d131a0b759476f9b24e`. System AI `1.1.4` и `installation-config-v9` сохранены без перевыпуска или активации конфигурации. Свежие 149 адресных тестов, lint, format, headers и instruction graph прошли. Реальные CLI и MCP подтвердили поиск, полное чтение с SHA-256 и новый Git HEAD. Ручная проверка пользователя в Admin direct, run `110`, conversation `66`, подтверждена серверным чтением завершённого run, ответа, lifecycle и search/read events текущего binding. Ручная проверка поискового субагента, run `112`, conversation `68`, также подтверждена: search/read без усечения, завершение native descendants и archive до итогового ответа. Затем пользователь подтвердил внешний ChatGPT обеими ссылками; новые search/read events в 10:56 UTC относятся к текущей сборке, оба complete. SourceUrl сохранён вместе с `utm_source=chatgpt.com`. Новая штатная попытка CR `22` / job `20` от `9499902` завершилась в 11:28 UTC с `changes_ready`: создан только regression test mapper (девять сценариев), secrets/lint/typecheck/test:int/build прошли; integration — 3365 passed / 0 failed / 163 skipped. Формат и шапки проверены отдельно. До обновления отчётности 65 прежних изменённых путей сверены без расхождений; временный лимит execution восстановлен с 4G до 3G. Реальные search/read events execution относятся к текущему binding. Приёмка этой версии подтверждает **6/7**: `cli`, `mcp`, `admin-direct`, `admin-subagent`, `chatgpt`, `execution`; отсутствует только `review`. Прежние checks и даты сохранены. Implementation acceptance, product review, service commit и preview ещё не выполнялись: review-only endpoint отсутствует, штатный preview pipeline включает автоматический service commit и clone preview-БД. Approval CR22 ограничен execution; следующий этап требует согласования готового diff. TASK-52 остаётся `in_progress`. [Проверка Admin direct](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-direct-110-result.json), [проверка субагента](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/admin-subagent-112-result.json), [проверка ChatGPT](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/chatgpt-baseline-20261022-result.json), [execution](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-baseline3-result.json), [installed preflight](../../.ai-workspace/tasks/2026-10-20-mcp-git-health-7c24/logs/execution-baseline3-installed-preflight.json) и [результат установки](../delivery/01-local-admin-ai.md) содержат evidence и историю проверок.
- **История активации 22 октября 2026 года, 07:25 UTC:** production-сборка `Mfqdf7h1W3_X-nmW3ydC7` и installed binding согласованы; активны System AI `1.1.4` и `installation-config-v9` с сохранением всех 32 artifact hashes. На этой сборке подтверждены CLI/MCP, Admin direct run `102` и ручная проверка пользователя через Admin: subagent run `105`, conversation `61`. Серверные события подтверждают поиск, чтение и закрытие дочернего потока; автоматизированный browser E2E этим не заявляется. Последующий реальный диалог ChatGPT подтверждён пользователем, исходным conversation URL и сохранёнными search/read events с текущим binding. На этой прежней сборке installed preflight подтвердил шесть из семи consumers: `cli`, `mcp`, `admin-direct`, `admin-subagent`, `chatgpt`, `execution`. Для `execution` засчитаны реальные search/read events job `18` с текущим binding; сам job завершился `failed` на TypeScript из-за V8 heap OOM. Повторный job `19` при временном бюджете памяти `4G` прошёл typecheck, но получил 27 падений в `test:int`. Отдельная диагностика с `REALIZE_BUILD_WITHOUT_DATABASE=false` дала 3338 passed / 16 failed / 163 skipped; все девять новых тестов mapper прошли. Изолированный candidate содержит исправление build-only флага checkRunner, четырёх устаревших fixtures и 13 ссылок AI metadata. После физического копирования dependencies по контракту `withWorkspaceDependencies` полный suite прошёл: 3365 passed / 0 failed / 163 skipped за 327,6 с. Первая диагностика с symlink dependencies сохранила девять environment failures; guards не ослаблялись. Typecheck прошёл за 54,6 с, scoped ESLint шести исходников — за 3,81 с; физическая копия dependencies удалена после проверок. На этапе подготовки patch из 16 файлов ещё не был применён. Для его установки требовались commit, согласованная сборка и активация runtime binding; System AI `1.1.4` и overlay v9 для этого patch перевыпускать не требуется. До следующего обновления installed sourceVersion/BUILD_ID не менялись, лимиты execution были восстановлены до `3G`. На этом этапе полная приёмка оставалась `incomplete`: продуктовый `review` ещё не был выполнен, candidate не был принят. [Результат установки](../delivery/01-local-admin-ai.md) содержит evidence, ограничения execution и поиска ChatGPT, результат полного gate.
- **Контракт MCP `1.4.0`:** добавлен `repo_git_head` для отдельного ограниченного чтения HEAD/branch; реальный Admin run `102` подтвердил этот путь. Уже запущенные внешние клиенты могут сохранять прежний catalog: их обновление требует повторного discovery и реального вызова. Исторический ответ connector `1.3.1` не подтверждает текущую версию его сессии.

## Project-specific servers

Текущий project contract содержит:

- `recommerce-playwright` — browser/runtime evidence;
- `recommerce-tailwind` — Tailwind UI assistance;
- `recommerce-next-devtools` — Next.js docs и development diagnostics;
- `realize-internal` — developer Repo/Git/S1 на `127.0.0.1:4319`.

Доступность каждого server-а проверяется в текущей Codex session. Запись в
project config не является доказательством запущенного runtime.

## Payload MCP

Payload MCP server и endpoint `/api/mcp` в текущем приложении отсутствуют.
Поэтому `recommerce-payload` удалён из project config. Внутренний
`/api/realize-ai` и typed Payload executors не являются MCP.

Новый Payload MCP можно добавить только после реализации endpoint,
authentication, least-privilege tool registry, protected-scope policy,
version/source evidence и runtime tests. Secret не хранится в Git,
`documentation/**`, `.ai/**` или `.codex/**`.

## Policy

Активные правила выбора MCP, availability и fallback находятся в
`.ai/rules/external-tools/**` и MCP workflow. Session-provided/plugin tools не
становятся постоянным project contract автоматически. Execution worker не
получает MCP как скрытый обход Change Engine.

## Внутренний MCP и управление в Admin

[Контракт A+G](../specifications/internal-mcp.md#mcp-server-management)
реализован отдельным `services/internal-mcp`: официальный SDK 2.0.0,
Streamable HTTP, modern `2026-07-28` и legacy `2025-11-25` в одном registry.
Listener привязан к `127.0.0.1`; `/mcp` требует Bearer, `/health` сообщает только
живость процесса. Встроенный `/api/mcp` Payload по-прежнему не устанавливается.

В Payload Admin доступны «Настройки → MCP-серверы», список с фильтрами,
создание нескольких экземпляров, форма, клиенты, проверка, discovery и история.
Исполняемый adapter — Realize Internal. Next.js и Payload можно зарегистрировать
как сведения о внешних подключениях; UI явно объясняет отсутствие runtime-действий.
Внешний HTTP/stdio executor и consumer bridge встроенного административного
Codex относятся к следующим этапам. Development Codex подключён отдельно.

Входящие hosted endpoints и исходящие external connections используют разные
контракты; реестр, настройки и outbound vault остаются у существующего владельца
интеграций из [ADR-0012](decisions/ADR-0012-admin-integration-registry.md).

### Запуск и операторская привязка

Сначала применяются [миграции](../delivery/03-migrations-and-rollback.md), включая
`20260923_120805_internal_mcp`. `npm run mcp:serve` — отдельная явная команда;
`dev`, Compose и execution worker не запускают MCP автоматически.

В bootstrap задаются экспортированные переменные:

```text
REALIZE_MCP_CONFIGURATION_MODE=bootstrap
REALIZE_MCP_REPOSITORY_READ_ENABLED=true
REALIZE_MCP_REPOSITORY_ROOT=<абсолютный путь checkout>
REALIZE_MCP_PRINCIPAL_ID=<стабильный идентификатор, латиница/цифры/_/->
REALIZE_MCP_TOKEN=<случайный base64url credential не менее 32 байт>
REALIZE_MCP_PORT=4319
```

Bootstrap не загружает `.env`/Payload/БД и запрещает Pages и managed instance
settings. Он предназначен только для доверенного developer principal.

Managed mode использует существующие `DATABASE_URI`, `PAYLOAD_SECRET` и:

```text
REALIZE_MCP_CONFIGURATION_MODE=managed
REALIZE_MCP_SERVER_ID=<ID созданного в Admin экземпляра>
REALIZE_MCP_HOST_PROFILE_ID=local
REALIZE_MCP_CONTROL_LOCAL=<отдельный случайный base64url credential, 32 байта>
REALIZE_MCP_HOST_PROFILES=<JSON-массив профилей ниже>
```

Пример несекретной структуры операторского профиля:

```json
[
  {
    "id": "local",
    "label": "Локальная установка",
    "repositoryRoot": null,
    "repositoryServerIDs": [],
    "allowedPorts": [4319, 4320],
    "pagesRead": true,
    "workshop": false,
    "controlTokenEnv": "REALIZE_MCP_CONTROL_LOCAL",
    "maximumLimits": {
      "callsPerMinute": 60,
      "burst": 10,
      "concurrentCalls": 4,
      "responseBytes": 131072
    }
  }
]
```

Admin web и MCP process получают один trusted profile и control credential.
Для repository grant оператор отдельно задаёт `repositoryRoot` и добавляет
конкретный server ID в `repositoryServerIDs`, затем перезапускает процесс.
Admin не может изменить эти поля. Control credential разрешает только protocol
discovery; вызов инструментов им запрещён. Root, control credential, verifiers
и applied snapshots не входят в browser DTO.

В Admin: создать отключённый сервер → настроить инструменты и limits → запустить
его процесс с instance ID → выдать клиентский ключ → включить доступ → применить
настройки. Новый ключ показывается однократно; повтор того же запроса возвращает
только результат без секрета. Потерянный ключ перевыпускается. Срок — до года,
не более 100 client records на экземпляр, включая отозванные; автоматического
удаления клиентов, receipts и audit нет.

Disable/revoke и сужение прав действуют до следующего вызова. Расширение прав,
новые/перевыпущенные ключи ждут apply. Heartbeat раз в 2 секунды подтверждает
boot/revision/hash; после 30 секунд без него UI показывает устаревшее состояние.
Изменение порта требует перезапуска оператором. Ошибка managed БД закрывает
вызовы, без перехода к bootstrap. Ctrl+C/SIGTERM завершает собственный listener
и Payload pool; общий срок завершения процесса — 5 секунд.

### Инструменты и ограничения

Доступны `realize_get_context`, `repo_list_files`, `repo_read_file`, `repo_search`,
`repo_git_head`, `repo_git_status`, `repo_git_diff`, `pages_list`, `pages_get`, `pages_get_structure`,
`ai_context_resolve`, `ai_instructions_get`, `ai_capabilities_list`.
Ещё 11 `workshop_*` handlers реализуют каталог/чтение snapshots, создание,
prepare/review/apply и capture preview через общий Workshop facade.
Всего 24 handlers; developer bootstrap регистрирует 10 без Pages и Workshop.
Каталог отфильтрован по реальным grants и настроенным ports; Pages использует текущего
пользователя и существующие Pages/Forms ACL без Codex credential и AIRun.

Для Workshop оператор включает `workshop: true` в доверенном host profile
web/MCP/worker; затем в Admin разрешают нужные `workshop_*` tools и сохраняют
клиентские права «читать проекты», «сохранять правки», «preview». Write и preview
требуют read, actorBinding self и текущие разрешения пользователя. Старые keys
с отсутствующими полями получают false. Предустановка не повышает grants
существующего подключения. Новые права начинают действовать после apply.
Статус и изображение также требуют preview grant; отзыв/перевыпуск ключа
останавливает его фоновые jobs. Настройки ключа OpenAI остаются в Admin vault.

Каталог capabilities версии `1.2` указывает реальные effects read/write/execute.
Данные проекта не становятся инструкциями. Create/prepare/apply/start требуют
UUID `idempotencyKey`; повтор потерянного ответа сохраняет его. Apply требует
проверенный `candidateHash`; при конфликте читают новую базу. Чтение файлов —
порциями, manifest/diff — страницами. MCP image возвращает JPEG-проекцию с pin
проверенного PNG в пределах 8–128 КиБ; Admin получает оригинальные PNG.
Полный контракт — [Workshop §12.3](../specifications/design-workshop.md#123-admin-preview-и-managed-mcp-правки).

`ai_context_resolve` обходит обязательное ядро, профильные registry и literal
ссылки из Markdown. Пределы: 16–96 попыток чтения (по умолчанию 64), глубина 2,
128 КиБ на источник, 2 МиБ суммарно. Возвращаются paths/hashes/provenance,
issues и coverage; текст клиенту ещё не доставлен. Применимость всегда
`needs_review`, `completeBootstrap: false`: resolver не исполняет YAML/команды
и не разрешает смысловые противоречия prose. Отложенные ссылки надо проверить
по области задачи; task notes, Pages и runtime state не повышаются до policy.

`ai_instructions_get` читает точный исходник порциями с обязательным
`expectedSha256`; продолжение — `nextLine`. Изменившийся hash требует обновить
контекст. Cache нет; `policyHash` описывает просмотренный набор, не доказывает
полноту или атомарный snapshot всех файлов. Оба инструмента требуют явного
tool allowlist, repository read и `developerInstructions` policy.

`ai_capabilities_list` использует тот же каталог, что SDK registry, и проверяет
repository/Git dependencies. Pages отмечается `not_probed`: доступность БД и
ACL устанавливает реальный Pages call. Отзыв разрешений проверяется перед
каждым вызовом; discovery не выдаёт новых прав. При выключенном MCP агент
читает те же исходники напрямую по действующим правилам. Live evidence и
Git delivery таким чтением не заменяются.

Repository owner — `services/ai-control-plane/src`, Git port —
`.ai/tools/git-delivery/src/read`, общий Git process/lock owner —
`packages/git-runtime`. Платформа, IDE и GPT/MCP используют один executor с
разными контекстами разрешений по [ADR-0016](decisions/ADR-0016-development-git-delivery-handler.md).
GPT сохраняет существующие repository grants; перенесённый executor не добавляет
инструменты записи. Его sources и typed read ports входят в source binding;
приёмка прежнего установленного binding не подтверждает новую сборку.
Linux descriptor pinning запрещает symlinks,
hardlinks, вложенные repositories и замену предков пути; private/runtime/state,
`.env`, binaries и явные секреты исключаются. Git binary/untracked/unmerged
показываются как omission без patch. Secret detector является дополнительной
защитой; он не доказывает отсутствие всех возможных секретов в исходниках.

`repo_git_head` принимает только пустой объект `{}` и возвращает `head`,
`branch`, `detached`, `unborn`. Reader проверяет согласованность HEAD/branch
в пределах общего deadline, не собирая status или полный снимок файлов.
`head:null` допустим для unborn branch; detached HEAD сохраняет коммит при
`branch:null`. Этот ответ не содержит оценки dirty/clean и не заменяет status,
diff или проверку fingerprint перед commit. При отсутствии repository grant
инструмент недоступен; `.git` не открывается через файловые средства.

Запрос ≤64 КиБ; файл ≤2 МиБ; scan ≤50 МиБ/10 000 entries; ответ ≤128 КиБ.
Пагинация связывает principal, policy, query и snapshot; cursor живёт 10 минут
и инвалидируется после рестарта. Diff делится только по полным hunks.
Пределы: 60 calls/minute, burst 10, 4 concurrent calls на principal, 8 на процесс,
один search на principal. Repo/Git deadline — 10 секунд, Pages — 15 секунд;
PostgreSQL query отменяется до возврата занятой session в pool.

### Подключение клиента

Клиент получает адрес `http://127.0.0.1:<port>/mcp` и собственный inbound token.
Текущая `.codex/config.toml` подключает локальный developer bootstrap через
поддержанный Codex `http_headers_helper`:

```toml
[mcp_servers.realize-internal]
url = "http://127.0.0.1:4319/mcp"
http_headers_helper = "node scripts/runtime/readLocalMcpHeaders.controller.mjs"
startup_timeout_sec = 20
tool_timeout_sec = 30
```

Клиент запускается из корня проекта с `PATH`, в котором выбрана точная пара
Node/npm из root `package.json`, по
[контракту runtime](../../.ai/rules/development/RULE-DEPENDENCY-VERSION-EVIDENCE-BEFORE-INSTALL.md#единый-runtime-проекта).
Stdio adapters в том же config используют `command = "npx"`; helper использует
`node` из окружения клиента. До запуска клиента выполни `npm run verify:runtime`.

Helper читает `REALIZE_MCP_CLIENT_TOKEN` из client environment либо из
`~/.local/share/realize-ai-cms/internal-mcp.env` и отдаёт JSON headers только
клиенту. Файл должен принадлежать текущему пользователю, быть обычным файлом
без group/other permissions, symlink/hardlink и быть не больше 8 КиБ.
Окружение приложения не загружается. Значение credential не выводят в терминал,
не сохраняют в TOML, Git или документацию. Env-only вариант другого клиента —
`bearer_token_env_var = "REALIZE_MCP_CLIENT_TOKEN"` вместо helper.
Формат helper проверен установленным Codex 0.154.0 и описан в
[официальной документации](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

На этой машине явно установлена пользовательская `realize-mcp.service`,
включённая в `realize.target`. Она запускает source entrypoint
`services/internal-mcp/src/runMcp.controller.ts` с exact Node 24.18.0 и
читает private env установки. Это отдельный bootstrap endpoint без БД и Pages,
а не экземпляр из Admin; managed instances продолжают использовать собственные
профили, процессы и client keys. Проверка и управление этой локальной службой:

```bash
systemctl --user is-active realize-mcp.service
systemctl --user restart realize-mcp.service
curl --fail http://127.0.0.1:4319/health
```

На другой машине service, runtime и credential настраиваются отдельно;
entry не создаёт их автоматически. После изменения config или локального
окружения нужна новая Codex сессия. Прежний автоматический probe подтвердил
подключение и вызовы трёх S1 tools
через настоящий Codex app-server с ephemeral thread, без model turn;
`AGENTS.md` совпал с прямым чтением по байтам и hash. Это не включает outbound
MCP у продуктового execution worker.

Этот endpoint не предоставляет
system writes, tools установки пакетов, deployment или публичный transport ChatGPT;
эти контракты остаются отдельными S2–S5/B/P/C этапами.

### Проверки

S1 проверяют `resolveAiContext.service.int.spec.ts`,
`mcp-system-context.int.spec.ts` и `readLocalMcpHeaders.service.int.spec.ts`:
реальные Markdown fixtures, пропуски/конфликты, budgets, hashes, запрет
task/secret/link paths, актуальность policy/grants, обе версии протокола,
недоступные зависимости, credential helper и direct fallback после shutdown.

`tests/int/mcp-repository.int.spec.ts`, `mcp-protocol.int.spec.ts` проверяют FS,
Git, обе protocol eras и standalone bootstrap/SIGTERM. `mcp-managed.int.spec.ts`
запускается только с явно заданным `MCP_TEST_DATABASE_URI`, совпадающим с
`DATABASE_URI` одноразовой `realize_mcp_fixture*` на loopback. Он использует
настоящие Payload collections, Pages/Forms ACL, CAS, ключи, apply, занятый DB lock
и отказ при закрытом pool. Собственный pool закрывается при завершении MCP;
его запуск не создаёт extensions и не включает read replicas.
Для `repo_git_head` дополнительно проверяются empty-args schema, обычный,
detached и unborn HEAD, deadline/cancellation и независимость файлового
чтения от Git-ошибки. В Admin проверяется тот же контракт в direct и native
MCP, общий budget и отсутствие Git-команд внутри временного Context Pack.
`tests/e2e/admin-mcp.e2e.spec.ts` проверяет Admin с реальным API и listener,
двумя темами и viewport 1440/390, стандартным `/admin` и нестандартным `/control`.
Проверенная здесь PostgreSQL — 18.6;
Compose baseline 15.18 отдельно не запускался. Детали приёмки — в плане A+G.

Admin не заменяет `.codex/config.toml` и не включает outbound MCP встроенного
Codex. Настройки и apply работают у hosted Realize adapter; отдельные внешние
executors проходят свои этапы G5/P4 по [плану](../specifications/internal-mcp-implementation-plan.md).

## Предустановленные MCP-серверы

Каталог `MCP_SERVER_PRESETS` поставляется в `@realize/ai-contracts`. Сейчас в нём
Realize Internal: стабильный serverID, профиль `realize-local`, порт 4320,
12 разрешаемых инструментов. Это шаблон настроек без ключей и grants.
Next.js/Payload пока доступны только как metadata-only типы внешних подключений.

При входе пользователя с `canManageIntegrations` плагин добавляет отсутствующие
предустановки в обычный integration registry. Для уже открытой сессии после
обновления есть кнопка «Установить серверы по умолчанию» и authenticated POST
`/api/realize-ai/mcp-servers/install-defaults` с пустым JSON body и обычным
idempotency header. GET `/catalog` только показывает состояние.

Новая запись отключена, без клиентов и credentials; процесс не запускается.
Host profile задаёт оператор. Повторная установка, в том числе одновременная,
не сбрасывает название, настройки, revision, отключение или клиентские ключи.
Audit использует действительного пользователя, а не фиктивный system account.
Изменений schema для предустановок нет.

## Обычный ChatGPT: текущая локальная подготовка

Настройки подключения находятся в **Настройки → MCP-серверы → нужный экземпляр
→ Подключение ChatGPT**. Здесь клиент вводит Tunnel ID и OpenAI key с Tunnels
Read + Use, выбирает права чтения и срок локального доступа, затем нажимает
«Сохранить и подключить ChatGPT». Сервер должен быть включён. При повторном
сохранении пустое поле ключа сохраняет прежний ключ. «Отключить ChatGPT и удалить
ключ» отзывает выделенный локальный доступ и удаляет credential envelope.

Для каждой установки используется своя БД, а внутри неё — отдельная запись и
AAD для каждого MCP instance. Ключи шифруются существующим integration vault;
Admin читает только статус наличия ключа. Master key
`REALIZE_INTEGRATIONS_ENCRYPTION_KEY` остаётся настройкой оператора установки,
вместе с доверенным host profile и установленным executable. Предустановки
не содержат ключей или чужих Tunnel ID.

Оператор указывает в host profile необязательное поле `tunnelClientPath` —
абсолютный путь к проверенному official tunnel-client (в этой установке 0.0.14).
Без него или без настроенного vault форма объясняет недоступность подключения.
Executable не выбирается из браузера. Версия и установка сверяются с
[официальным руководством](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
Перед запуском обновлённого web/MCP примените migration
`20260925_093817_chatgpt_tunnel_status`.

Managed MCP сам ведёт дочерний tunnel-client. Он получает ключи только в памяти,
передаёт их через child environment, использует фиксированный loopback endpoint
и private Unix health socket. Save запрашивает применение revision; до
подтверждения новая конфигурация не используется. Смена ключа заменяет child,
отключение/отзыв/истечение прав запрещает новые calls, сбой БД останавливает
туннель. «Обновить состояние» читает текущее наблюдение; «Туннель готов» означает
успешный `/readyz`, а не проверенный вызов из ChatGPT.

В текущей локальной установке отдельный `realize-mcp-chatgpt.service`
обслуживает `127.0.0.1:4320/mcp`; bootstrap `realize-mcp.service` на 4319
используется Codex отдельно. Подготовленная ранее ручная
`realize-mcp-chatgpt-tunnel.service` должна оставаться выключенной, чтобы не
запускать второй tunnel-client. `chatgpt-openai.env`, `chatgpt-mcp-client.env`
и `chatgpt-tunnel.yaml` не являются источниками настроек нового supervisor.
Вручную выданные clients сохраняются и отзываются отдельно; настройка нового
connector не удаляет посторонние ключи.

В [OpenAI Platform](https://platform.openai.com/settings/organization/tunnels)
создайте tunnel и разрешите целевой workspace (создание требует Read + Manage).
После сохранения подключения в Admin добавьте developer app в
[ChatGPT](https://chatgpt.com/plugins), выберите Connection → Tunnel и добавьте
приложение в чат. Доступные участники tunnel используют выбранные права MCP;
индивидуальный OAuth и публичный HTTPS endpoint относятся к отдельному решению.

Проверка в обычном ChatGPT: «Вызови ai_capabilities_list, затем
realize_get_context и прочитай README.md через repo_read_file».
Локальные SDK/DB/browser проверки не заменяют эту приёмку. Реальный ключ
пользователь вводит самостоятельно в Admin; до успешных вызовов из чата
облачная приёмка C остаётся открытой. MCP не вызывает модельный API или Codex.

Capability discovery проверяет Git metadata без чтения всех файлов.
`realize_get_context` `1.1` проверяет filesystem и Git отдельно:
`modules.repository` описывает доступность файлового корня, `modules.git` —
Git metadata. Context читает только текущие HEAD/branch через внутренний Git
helper, без полного снимка файлов. Успешный summary содержит `dirty:null` и
`dirtyStatus:"not_checked"`: это не подтверждение чистой рабочей копии.
Отдельное чтение HEAD/branch выполняет `repo_git_head` с аргументами `{}`;
для состояния разрешённых файлов вызывается `repo_git_status`.

При Git timeout `modules.git` сообщает `unavailable` с `reasonCode:"TIMEOUT"`,
а Git summary `repository` становится null. Доступный файловый корень при этом
остаётся `modules.repository.status:"ready"`; чтение README и инструкций может
продолжаться. Полный content snapshot, hashes и cursor conflicts сохраняются
у `repo_git_status`; адресный `repo_git_diff` сохраняет точные стороны и
повторную проверку снимка. Оптимизация чтения не меняет development inspect,
fingerprint проверок перед commit или permissions Git-воркера.

Ответ MCP с `TIMEOUT` отдельного инструмента или `FORBIDDEN` для `.git`
не доказывает разрыв соединения. Проверяйте фактический module/reason code и
отделяйте его от transport/auth failure. Внешний `INVALID_ARGUMENT` может быть
обёрткой ошибки инструмента, поэтому в отчёт включается исходный код сервера,
если он доступен. Для HEAD используйте `repo_git_head`; `realize_get_context`
также содержит ограниченный Git summary. Служебный каталог `.git` остаётся
закрытым. В чате Admin рабочий каталог модели является Context Pack, а не
checkout: Git-команда внутри него не заменяет серверный инструмент и не
диагностирует проект. На старом сервере `1.3.0` Git timeout мог пометить весь
repository как unavailable; успешное чтение файла опровергает такой вывод
о недоступности файлового слоя.

После обновления и restart runtime повторите discovery инструментов в
подключённом клиенте и обновите сохранённые output schemas. Ответ context
имеет `outputSchemaVersion:"1.1"` в metadata инструмента, общий envelope
сохраняет `schemaVersion:"1.0"`. Клиент с прежним ожиданием `dirty:boolean`
должен принять явное состояние «не проверено»; приводить null к false нельзя.

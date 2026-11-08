# ADR-0016: Общий исполнитель Git и адаптеры доступа

## Статус и область

`accepted-as-target`, уточнено 23 октября 2026 года. Development `inspect`
выполняется отдельным программным адаптером без модели. Локальный `commit`
и отдельный `push` с подключением из БД по HTTPS/SSH используют модельного
Git-воркера. Расширение маршрута добавляет `manage`, `fetch`, `pull` и GitHub
`merge` проверенного дерева с отдельными контекстами и ограничениями,
описанными ниже. Изолированная приёмка merge подтверждена 30 профильными и
полным набором 588 Git regression tests; реальная publication через модель
проверяется отдельно.
Вызывающая среда отвечает за пользовательское разрешение;
контекст передачи отделён от модели. `commit_push` остаётся целевым контрактом.
Реальная отправка проверяется изолированными фикстурами; подключение рабочего
проекта и реальный SSH-сервер требуют отдельной эксплуатационной проверки.

Общий программный исполнитель обслуживает рабочую копию разработчика,
продуктовые execution/preview, SourcePromotion и release candidate, а также repository reads из
платформы и GPT через внутренний MCP. Различаются разрешения и сценарии входа;
политики запуска процесса и блокировок принадлежат одному владельцу.
Приёмка изменений, ReleaseCandidate и развёртывание сохраняют свои контракты.
Основание — аудит Git-процесса от 2026-09-07
и последующее решение выполнять Git через отдельного воркера без истории диалога.
Уточнение от 23 октября 2026 года переводит только development `inspect`
на программное исполнение через прежние validator/delivery/handler/runtime contracts;
остальные действия, включая читающий `manage`, сохраняют модельный маршрут.

## Ответственность и размещение

Серверный пакет `packages/git-runtime` (`@realize/git-runtime`) владеет запуском
Git, безопасным окружением, ограничениями времени/вывода, классификацией ошибок
и общей блокировкой. Адаптеры импортируют его напрямую; собственные запускатели
Git и прокси по прежним путям не поддерживаются.

| Вход                    | Контекст и полномочия                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDE / development CLI   | Программный `inspect` и модельные воркеры остальных действий через `.ai/tools/git-delivery`: разрешённая пользователем область, проверки, авторство и журнал восстановления.    |
| Платформа               | Execution/preview/SourcePromotion owners: CR/job, принятые plan/diff, approval, evidence, выделенный worktree и служебное авторство. Admin chat читает через repository bridge. |
| GPT / ChatGPT connector | Существующий `services/internal-mcp`: server-owned root, principal, grants, allowlist tools, бюджеты и DTO. Repository read credential не разрешает запись.                     |

Для IDE основной агент передаёт действие и необязательное сообщение коммита,
затем получает фактический результат адаптера. Development `inspect`,
детерминированное чтение платформы и MCP не запускают LLM. Модель не выбирает
shell/Git argv, root,
credentials, профиль исполнения или lock lease. Новый публичный API записи
в GPT/MCP этим решением не вводится.

Изменяющие фазы используют один `flock` по каноническому `git-common-dir`,
общему для связанных worktrees. Исполнитель принимает только выданную общим
owner непрозрачную lease; повторное использование в пределах фазы не получает
ту же блокировку заново. Проверяются принадлежность и действительность lease
до записи. Scope/evidence checks выполняются владельцем операции под этой
блокировкой. Build, review, копирование БД и browser-проверки не удерживают её.
Блокировка координирует эти адаптеры и не изолирует checkout от произвольных
внешних процессов; сравнение снимков перед записью остаётся обязательным.

Процесс запускается без shell, с allowlist окружения, ограниченными stdin,
stdout/stderr и временем; отмена завершает группу процессов. Machine-read
профиль ограничивает команды и отключает неявную сеть/замену объектов и
исполнение локальной конфигурации. IDE commit/push сохраняют пользовательские
hooks и подпись. Служебный preview commit использует отдельный контролируемый
профиль и service identity; этот профиль не применяется к commit разработчика.
Credentials разрешает существующий владелец интеграций, они не поступают
модели или клиентскому DTO.

SourcePromotion и release candidate создают новые scoped refs через общий
create-only builder: `--force-with-lease=<exact-ref>:` проверяет отсутствие
remote ref атомарно. Появившаяся после preflight ветка не перезаписывается,
даже если approved commit допускает fast-forward. Безусловный `--force`
запрещён. Это условие создания продуктовой ref не меняет обычный IDE push:
он сохраняет собственный pre-push guard и запрет force.

Место IDE-адаптера и существующих typed read ports — `.ai/tools/git-delivery/`.
Политика чтения файлов остаётся у repository owner control plane; низкоуровневый
пакет не импортирует product services. Внутренние части:

| Часть                                          | Ответственность                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `src/runGitDelivery.controller.ts`             | Разбор входа, выдача ограниченного JSON-результата                      |
| `src/loadGitContext.adapter.ts`                | Ограниченное чтение личного файла контекста запуска                     |
| `src/handler.ts`                               | Порядок операции, блокировка, контроль состояния и повтор               |
| `packages/git-runtime/src/`                    | Общий Git process engine, ошибки и lock lease для всех адаптеров        |
| `src/contracts.ts`                             | Валидация команды и разрешённого контекста                              |
| `src/repository.ts`                            | Снимок рабочей копии и входов проверок                                  |
| `src/safety.ts`, `src/commit/`                 | Совместимые экспорты проверок, контроль индекса и восстановление commit |
| `src/state.ts`, `src/GitJournal.repository.ts` | Доступ к журналу операций IDE и файловое хранение                       |
| `src/push/runGitPush.service.ts`               | Порядок push и восстановление результата                                |
| `src/push/GitPushSource.service.ts`            | Проверка ветки и публикуемой истории                                    |
| `src/push/openGitPushResources.adapter.ts`     | Общий серверный resolver и ресурсы подключения                          |
| `src/network/`                                 | HTTPS/SSH, удалённые ссылки и guard отправки                            |
| `src/manage/`                                  | Отдельный контекст и журнал локального управления Git                   |
| `src/sync/`                                    | Закреплённый fetch и fast-forward pull с журналом этапов                |
| `src/merge/`                                   | Approved-tree GitHub commit с двумя parents и обновление target ref     |

SQL и vault принадлежат общему серверному модулю интеграций; здесь нет их копий.

Source binding и release inventory включают общий пакет и используемые
machine-read ports. Изменение этих sources требует новой версии binding.
Проверки исходников не подтверждают обновление установленного runtime:
активация сборки и installed acceptance выполняются отдельно, прежние receipts
не переносятся на новый binding. Рефакторинг не запускает deploy или preview.

Запуск действий принадлежит `src/worker/`. Программный
`src/worker/runGitInspect.service.ts` проверяет контекст через
`validateGitWorkerContext` и выполняет `deliverGitWorkerCommand` →
`runDelivery` → `@realize/git-runtime`. `GitWorkerCapability` остаётся адаптером
модельных действий и для программного inspect не вызывается. Сохраняются typed command/root/scope/inputPaths
validation, read-only права, ограниченная сводка и прежний fingerprint.
Основному агенту не разрешаются raw Git или произвольный shared executor.

Остальные действия используют общий транспорт `@realize/codex-adapter/rpc`,
а не собственную копию протокола Codex. Конфигурация модели и инструкция находятся в `.codex/agents/delivery/git/`
и `.codex/prompts/workflows/delivery/git/`. Доступный вход:
`npm run --silent git:worker -- inspect`, `commit [message]`, `push`, `manage`,
`fetch`, `pull` или `merge`.

Для `inspect` не требуются Codex CLI, App Server, `model/list`, модельные
prompt/profile, БД или `REALIZE_GIT_CODEX_HOME`.
Для остальных действий standalone Git CLI использует существующий
`CodexConnectionService`: подключение `codex:primary` из Admin registry/vault,
DB lock, isolated lease, корректный authMode и token refresh. Адаптер
`openGitWorkerTransport.adapter.ts` владеет последовательностью process close →
lease dispose → Pool close и связывает transport с registry cancellation.
Доступность интеграции не добавляет Git permissions. Model/effort role остаются
в проектных `.codex/agents/delivery/git/`.

`REALIZE_GIT_CODEX_HOME` остаётся совместимой ссылкой доверенной среды на уже
авторизованный профиль, прежде всего для вложенного worker внутри Admin run.
Родитель уже держит DB lock, поэтому такой запуск не получает второй lease и
не удаляет чужой профиль. Пустое/относительное/с NUL explicit значение даёт
`worker_profile_invalid`. Отсутствие override выбирает Admin integration, а не
унаследованные `HOME`, `CODEX_HOME` или API keys. Missing/disabled/busy integration
даёт безопасный `worker_connection_unavailable`; ошибка cleanup —
`worker_connection_cleanup_failed`. Git report не содержит lease/credentials;
ошибка cleanup не скрывает результат уже начатого Git-действия.

Для каждого ограниченного модельного Git-действия модель получает краткий prompt и команду,
без полных AGENTS, Git-правила, workflow, навыков и истории. Основной агент
применяет Git-маршрут перед вызовом; ограничения обеспечивает программа.
Контекст задаётся явными переопределениями инструкций сессии. Этот маршрут
не распространяется на разработку; его границы
определяет [Git-правило](../../../.ai/rules/git/RULE-GIT-DELIVERY.md).

Обычный `inspect` получает контекст чтения всей рабочей копии в памяти.
Для адресного чтения и остальных действий вызывающая среда передаёт отдельный личный файл
через `REALIZE_GIT_CONTEXT_FILE`. Она отвечает за связь с явным пользовательским
запросом; файл не доказывает согласие человека и не изолирует программы одного
системного пользователя. До исполнения проверяются корень установленного
инструмента, выбранное действие, scope, inputPaths и, для commit, identity
и полнота evidence.
Фактическое соответствие проверенному снимку устанавливает обработчик.
Никакие поля контекста не доступны для задания через аргументы модели.

Заданный текст commit закрепляется программно. Без текста воркер получает
сводку путей/status в той же области через `git_inspect`, затем передаёт только
сообщение в `git_commit`. Полный diff не загружается. Внешний отчёт содержит
эффективную `command`; для повтора сохраняются её сообщение, контекст и requestId.
При утрате сообщения после обрыва требуется разбор журнала, а не новый запрос
для обхода конфликта. Сбой модели сохраняет фактический результат начатой операции.

Для модельных действий используются новая ephemeral-сессия и `dynamicTools`
установленного Codex App Server; Git запускается только после проверенного
запроса инструмента.
Эта часть протокола экспериментальная: совместимость проверена с CLI `0.153.4`.
Неподдерживаемый протокол или модель блокируют вызов без автоматической замены.
Контракт основан на [официальном описании App Server](https://developers.openai.com/codex/app-server)
и схемах установленной версии; поведение и ограничения описаны в README инструмента.
[agent-runtime](../../../.ai/tools/agent-runtime/README.md) сохраняет
ответственность за сессии и сообщения. Его SQLite и monitor не являются
обязательными зависимостями Git-операции. Обработчик запускается там, где
доступна рабочая копия; отдельный сетевой сервис для первого этапа не нужен.

Профиль Git-воркера выбирает модель независимо от обработчика. Пользовательский
выбор — `gpt-5.6-luna` с уровнем рассуждения `low`; доступность проверяется при настройке
адаптера. Вызов не наследует диалог. Недоступная модель возвращает явную ошибку;
автоматическая замена основным агентом или другой моделью не допускается.

## Входной контракт

Минимальная команда основного агента:

```json
{
  "action": "commit_push",
  "message": "Уточнить инструкции рабочего слоя ИИ"
}
```

| Поле      | Контракт                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `action`  | `inspect`, `commit`, `push`, `manage`, `fetch`, `pull`, `merge`; `commit_push` остаётся целевым действием |
| `message` | Необязательная непустая строка для локального commit; merge message задаёт только отдельный context       |

`inspect` даёт программному адаптеру отдельный вход для чтения локального состояния и сводки
изменений. Он не требует разрешения на доставку, не меняет индекс и файлы,
не обращается к БД или сети. Достаточно разрешённого анализа репозитория;
полученный результат сам по себе не разрешает последующие commit или push.

Неизвестные поля и действия отклоняются. Вход не принимает произвольную команду,
Git-флаги, токен, SSH-ключ или адрес назначения от модели. Сообщение коммита
передаётся как данные. Если оно не задано, воркер составляет его по сведениям
об изменениях, полученным от обработчика.

Механизм запуска добавляет доверенный служебный контекст вне текста задания:

| Поле                  | Источник и назначение                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestId`           | Уникальный идентификатор операции; сохраняется при повторе                                                                                           |
| `projectId`, `taskId` | Привязка к проекту и текущей задаче                                                                                                                  |
| `repositoryRoot`      | Рабочая копия из конфигурации среды запуска                                                                                                          |
| `authorization`       | Разрешённые действия и область чтения или изменений: конкретные пути либо явно разрешённый полный состав; для push — назначение и допустимые коммиты |
| `identityRef`         | Настроенные автор и коммитер, нужны только при создании commit; секрет подключения не определяет авторство                                           |
| `checksRef`           | Необязательная ссылка на фактически выполненные проверки                                                                                             |

Контекст не восстанавливается из комментариев в коде и не считается доверенным
только потому, что пришёл от модели. Механизм запуска связывает его с разрешением
пользователя. Отсутствие разрешения или однозначной рабочей копии блокирует
операцию; уже полученное разрешение не запрашивается повторно.

Git позволяет обнаружить состав и содержание изменений, но не доказывает
авторство незакоммиченной правки, разрешение пользователя или выполнение тестов.
При ограниченной области посторонние файлы не включаются автоматически.

## Подключение к репозиторию

Настройки удалённого репозитория поступают из существующего реестра интеграций
по [ADR-0012](ADR-0012-admin-integration-registry.md). Локальный путь относится
к среде запуска. Обработчик сопоставляет идентификатор репозитория из БД с
рабочей копией и фиксирует назначение перед сетевой записью.

Подключение общего серверного resolver:

| Поле                                   | Назначение                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `provider`                             | На первом этапе `github`; транспорт не является поставщиком                       |
| `connectionKey`, `revision`, `enabled` | Существующие идентификатор, ревизия и состояние                                   |
| `repositorySlug`, `repositoryURL`      | Однозначная идентичность репозитория; URL без секретов                            |
| `transport`                            | `https` или `ssh`                                                                 |
| `credentialRef` / `sshProfileRef`      | Ссылка на секрет или настроенный SSH-профиль, соответствующая способу авторизации |

`GitRepositoryConnectionService` возвращает `absent`, `disabled` либо `ready`
с `connectionKey`, `revision`, `repositorySlug`, `repositoryURL`, `transport`
и `token` для HTTPS или `sshProfileRef` для SSH. Общий валидатор используется
при сохранении и выполнении. В JSONB добавлены transport/sshProfileRef без новой
таблицы; отсутствие transport означает HTTPS. Старый клиент при сохранении
не стирает SSH-профиль. Admin UI выбора транспорта ещё не добавлен.

HTTPS использует зашифрованный токен из существующего хранилища и временный
`GIT_ASKPASS`. SSH использует настроенный ключ либо `ssh-agent`; в БД хранится
ссылка на профиль, а привязка к ключу, агенту и доверенным серверам принадлежит
конфигурации исполнителя. Для обоих способов сохраняется проверка подлинности
сервера. Интерактивный запрос пароля во время автоматической доставки запрещён.

Доверенная карта профилей задаётся через `REALIZE_GIT_SSH_PROFILES_FILE` вне БД:
known_hosts, ключ или явно назначенный agent socket с открытым ключом для выбора
identity. SSH использует BatchMode, IdentitiesOnly и строгие host keys без
пользовательского config. HTTPS использует только токен общего vault; credential
helpers, netrc и конфликтующие HTTP-настройки не дают альтернативного входа.
Конкретные параметры среды и профиля описаны в README обработчика.
GitHub REST сохраняет отдельный контракт: SSH-доступ к Git не заменяет API-токен.

Общий серверный модуль интеграций реализован в
[integrationRuntime](../../../packages/payload-ai-plugin/src/integrations/runtime/integrationRuntime.index.ts)
и доступен через `@realize/payload-ai-control/server/integration-runtime`.
Source/release-потребители подключены через `GitHubConnectionResolver`.
Модуль получает существующий Pool и ключ, читает актуальную запись при каждом
вызове и использует общий vault. Прежние состояния `absent`/`disabled`/`ready`
сохранены; политика отсутствующего подключения остаётся у потребителя.
SQL и криптография не копируются в операционный слой, секреты не выдаются
модели или через Admin DTO. Git-обработчик открывает этот модуль для push/fetch/pull;
перед сетевым этапом повторно проверяет назначенную ревизию подключения.

Для `inspect` и commit с явной `identity` БД не нужна. При её отсутствии
загрузчик commit читает `configuration.commitAuthor` через `GitCommitAuthorService`
после проверки области, разрешения, evidence и корня. Автор фиксируется
в контексте до модели; Pool закрывается сразу после чтения. Токен не
расшифровывается, внешняя сеть для commit не используется. Пустой или недоступный
автор блокирует запуск. Изменение автора в БД при повторе не заменяет исходную
identity операции; для восстановления она передаётся явно. Загрузчик не
сохраняет автора отдельно, а журнал содержит только хеш контекста. Если
первоначальная identity неизвестна, повтор блокируется. Для `push` и `commit_push`
недоступное, отключённое или изменившееся подключение блокирует сетевую запись.
Автоматического перехода между HTTPS и SSH, смены назначения или подстановки
случайных локальных учётных данных нет. `defaultBranch` не переключает текущую
ветку и не разрешает публикацию в неё.

## Контракт отдельного push

`GitPushContext` отделён от контекста локальных действий. Вызывающая среда передаёт
`authorization.actions: ["push"]`, точный список коммитов и `target`: connection key,
ревизию, slug/transport, ветку, исходный и ожидаемый удалённый OID. Каждый коммит
должен иметь фактические успешные результаты назначенных проверок. Отсутствие
удалённой ветки задаётся `remoteOid: null`. Модель получает только `git_push{}`.

Обработчик сверяет HEAD и ветку, полный публикуемый граф и разрешение, подключение
из БД и удалённую ссылку. Локальные подмены/усечения графа (`refs/replace`, grafts,
shallow) блокируют push. Fetch, staging и повтор тестов не выполняются.

Сетевой adapter строит канонический GitHub URL по slug; URL rewriting запрещён.
Проверка `ls-remote` дополняется guard в `pre-push`: он сравнивает фактически
объявленные сервером old OID, исходный OID и единственную ветку, затем вызывает
настроенный hook с исходным вводом. Отправка обычная, без force, followTags,
submodules и унаследованных push options. После записи читается удалённый хеш.
Это сохраняет поведение [Git hooks](https://git-scm.com/docs/githooks#_pre_push)
и ограничения [git push](https://git-scm.com/docs/git-push).

До отправки журнал фиксирует `prepared`, перед записью — `sending`, после
подтверждения — `succeeded`; сбой отправки оставляет `unknown`. Commit и push
используют общий файловый repository с разными схемами; одинаковый requestId
для разных действий блокируется. Повтор неизвестной отправки подтверждает
целевой хеш либо запрещает новую запись до разбора состояния. Успех возвращает
фактический `remoteCommit`, неизвестный исход не подменяется результатом модели.

Диагностика push — необязательный безопасный DTO `diagnostic` с этапом операции,
конечной категорией и `exitCode`. Git adapter классифицирует ограниченный
64 KiB буфер stderr; сырой текст, URL и credential не сохраняются. Неизвестная
причина остаётся `unknown`. Диагностика отправки сохраняется в журнале и
возвращается при сверке незавершённой операции. Ошибка подтверждения после push
отмечается этапом `confirm`, а не выдаётся за доказанный отказ записи.

Явно разрешённое восстановление задаётся вызывающей средой через
`recovery: { attempt: N }`, где `N` — следующий номер, от `1` до `16`.
Binding исключает только recovery; requestId, target, разрешённый набор и
проверки сохраняются. Журнал версии `1` расширяется необязательными
`recoveryAttempts` и `diagnostic`; старый журнал означает ноль повторов.
Восстановление требует существующей фазы `sending`/`unknown`, полной локальной
проверки, актуального подключения и прежней удалённой версии. Номер записывается
с фазой `sending` до сетевого вызова и повторно не используется. Уже достигнутый
sourceOid означает `noop`. Без отдельного разрешения повтор остаётся сверкой;
модель не назначает попытки, смена requestId и ручная очистка журнала не заменяют
восстановление. Неуспех новой попытки сохраняет `unknown` и новую диагностику.

## Расширение управления и синхронизации

Локальное управление принадлежит `src/manage/`, синхронизация — `src/sync/`.
Профили и prompts `manage/fetch/pull` живут рядом с существующими `.codex` Git
adapters; модель получает только одно одноимённое capability с `{}`. Вызывающая
среда заранее валидирует отдельный контекст, назначение и разрешение. Старые
контракты commit/push и binding их журналов сохраняются.

`GitManageContext` задаёт `authorization.actions: ["manage"]`, область repository
и одну операцию: remote-inspect/set-url, worktree-list/repair, branches-list,
branch-create/switch, log или diff. Запись требует ожидаемых HEAD и ветки.
`log`, `diff` и branch-create/switch блокируют partial clone до чтения объектов,
чтобы локальная операция не запускала неявный сетевой обмен.
Remote rename сверяет прежний URL и сохраняет GitHub-владельца и транспорт;
настроенный конфликтующий pushurl блокирует действие. Branch-create создаёт
ветку от ожидаемого HEAD, branch-switch работает с существующей локальной веткой;
оба требуют чистой рабочей копии. Repair принимает точные пути из отдельного
allowlist, покрывающего весь затрагиваемый существующий зарегистрированный внешний набор:
штатный Git repair после переноса основной копии меняет также остальные связи.
Неполный allowlist блокируется до записи. Метаданные отсутствующих каталогов
сохраняются без prune/create; существующий каталог с недопустимым `.git` или
symlink блокируется. Поддерживается перенос основной рабочей
копии с прежними внешними путями; произвольный перенос внешних worktrees не включён. Ограниченные log/diff
проходят контроль секретов. GitHub rename, CAS интеграции, filesystem move и IDE
настройки имеют собственных владельцев и не выполняются Git-моделью.

`GitSyncContext` разрешает ровно fetch либо pull в repository scope и закрепляет
primary integration, ревизию, slug, транспорт, текущую ветку, sourceOid и remoteOid.
Оба хеша обязательны и проверяются. Fetch получает только эту ветку и commit в
`refs/remotes/realize-sync/<branch>` через общий защищённый
HTTPS/SSH transport без tags, prune, submodules или FETCH_HEAD. Служебная ссылка
обновляется через CAS с прежним OID, закреплённым журналом под общим lock;
перед её обновлением проверяется тип полученного commit. Shallow/grafts/replace/partial
clone, незавершённая Git-операция или смена источника блокируют синхронизацию.
Pull дополнительно проверяет чистый индекс, рабочие файлы, untracked и отсутствие
index skip/assume flags и gitlinks в текущем индексе и полученном дереве, затем применяет только
`merge --ff-only --no-edit --no-autostash`. Новый merge commit не создаётся.
После успешного pull удаляется только служебная ссылка разрешённой ветки через CAS;
fetch сохраняет её в результате. Смена upstream не расширяет разрешённый commit.
Служебные refs не накапливаются с каждым новым requestId.

Новые записи используют ту же блокировку общего Git-каталога и файловое
хранилище журналов с отдельными схемами. Manage сохраняет before/after перед
записью; sync сохраняет этапы до fetch и fast-forward. Повтор сверяет точный
binding и фактическое состояние, устанавливает выполненную часть и не меняет
параметры при конфликте или неизвестном результате. Читающие manage операции
не создают журнал. Result сохраняет базовые безопасные поля и добавляет details
manage либо fetchedCommit/trackingRef/syncStatus и ограниченную diagnostic sync.

Конкретные DTO, лимиты и replay описаны в
[README обработчика](../../../.ai/tools/git-delivery/README.md#контекст-manage).
Область и состояние проверяются в
[management check](../../../.ai/checks/git/CHECK-GIT-MANAGEMENT-SCOPE.md) и
[sync check](../../../.ai/checks/git/CHECK-GIT-SYNC-READINESS.md).
Полные Git-команды и произвольные flags по-прежнему недоступны модели;
reset/rebase/stash/force, PR и deployment не входят в расширение.
Изолированная приёмка проверяет локальные операции, scoped fetch, ff-only,
отказы, replay и границы capability. Реальная синхронизация рабочего upstream
не запускается ради приёмки инструмента; SSH-сервер требует отдельного evidence.

Авторизация модели через `codex:primary` (либо выданный parent profile) отделена от GitHub credential.
HTTPS-токен хранится зашифрованным в integration registry и расшифровывается
общим vault по `REALIZE_INTEGRATIONS_ENCRYPTION_KEY`; env source precedence —
process environment, `.env.local`, `.env`. SSH identity относится к Git transport,
GitHub REST использует API credential общего resolver. Права репозитория задаёт
GitHub; repository permission не доказывает доступ к каждому admin endpoint.

## Слияние проверенного дерева

`merge` использует единственный mode `approved-tree`; профиль и prompt живут
рядом с существующими Git adapters. Модель `gpt-5.6-luna`, reasoning `low`,
timeout 120 секунд вызывает только `git_merge({})`. Generic local merge,
выбор стратегии и автоматическое разрешение конфликтов не предоставляются.
SourcePromotion и managed execution сохраняют собственные полномочия;
development context не заимствует их authority.

`GitMergeContext` закрепляет общие request/project/task/root и:

- `authorization: { actions: ["merge"], scope: { mode: "approved-tree" } }`;
- `target`: primary connection key/revision, slug, repository ID, точную
  `refs/heads/*`, commit OID и target tree OID;
- `source`: другую точную `refs/heads/*` и другой commit OID;
- `candidateSourceRoot`: канонический absolute каталог внутри
  `<repositoryRoot>/.ai-workspace/tasks/<taskId>/tmp/**`;
- `candidate`: ожидаемый tree OID, точный `approvedChangedPaths` и
  `files: [{ path, mode, blobOid }]`, ровно покрывающие этот список;
- обязательные `identity`, `message` и результаты проверок.

Все OID — ненулевые 40-hex GitHub SHA-1. Пути точные и канонически отсортированы;
пустой список допускается при сохранении target tree. Вызывающая среда проверяет
candidate bytes, сохранение принятой работы и значимые входы проверок до запуска.
File descriptors разрешают только `100644`/`100755` и ненулевой blobOid;
удаление задаётся `mode: null, blobOid: null` и отсутствием файла в source.
Источник bytes ограничен task tmp;
symlinks, gitlink uploads, traversal и произвольные sources не предоставляются.
Fingerprint каждого обязательного passed результата вычисляет
`hashGitMergeCandidate(context)`: SHA-256 canonical refs/tree/source и
file/blob metadata. Смена pinned refs, дерева, источника bytes или области
отменяет evidence. Проверяющий исполнитель использует dependency/build cache
вне approved paths. Обработчик не передаёт raw blobs модели и не принимает
статус проверки за самостоятельное доказательство пользовательского разрешения.

Подключение поступает от общего GitHub API resolver, независимо от transport
Git push/pull. Проверяются revision/slug/repository ID, refs и target commit tree.
Полный recursive target tree manifest должен иметь ожидаемый SHA и
`truncated: false`; ограничение обработчика — 50 000 entries. Точный diff конечных
paths по type/mode/object SHA должен равняться approvedChangedPaths. Все прочие
конечные paths сохраняются; изменение SHA родительского каталога вследствие
разрешённого изменения потомка не добавляет отдельный путь в diff.
Incomplete manifest блокирует любые POST. Только approved files читаются
из bounded candidateSourceRoot с `O_NOFOLLOW`, контролем path/mode, Git blob SHA
и секретов. Полный target leaf set с accepted overlays должен вычислять
assigned candidate tree OID до первой сетевой записи.
Пределы — 16 MiB на файл и 64 MiB на весь approved состав; остальные
snapshot/dependency/cache/env файлы не читаются.

До upload сохраняется journal. Immutable blobs POST проверяются по assigned
SHA, tree POST использует `base_tree: target.treeOid` и только approved entries;
его SHA должен равняться candidate tree. Полный recursive candidate manifest
заново подтверждает scope и сохранение всех прочих leaf entries до commit.
Отказ после upload может оставить immutable blobs/tree; ref при этом ещё
не считается обновлённой.
[GitHub blob contract](https://docs.github.com/en/rest/git/blobs#create-a-blob),
[GitHub create tree](https://docs.github.com/en/rest/git/trees#create-a-tree),
[GitHub tree contract](https://docs.github.com/en/rest/git/trees#get-a-tree).

До первого POST, включая uploads, под общим lock сохраняется journal body: candidate tree,
два ordered parents `[target.oid, source.oid]`, message, identity для author и
committer и единая UTC date. Детерминированный unsigned object OID позволяет
проверить неизвестный исход создания чтением без второго POST. Ответ создания
сверяется по OID, tree, обоим parents, message, identity и dates.
[GitHub create commit](https://docs.github.com/en/rest/git/commits#create-a-commit).

Перед обновлением снова проверяются обе refs. PATCH меняет только target ref
с `force: false`; post-read должен подтвердить созданный commit. Endpoint
обеспечивает fast-forward guard, но не принимает expected old OID: это точные
pre/post сверки с FF guard, а не unconditional CAS. Конкурирующее изменение
refs или branch protection остаётся явным ограничением.
[GitHub update reference](https://docs.github.com/en/rest/git/refs#update-a-reference).

Journal phases: `prepared/uploading/uploaded/creating/created/updating/completed/unknown`.
До первого POST сохраняются body/date/expectedCommit и uploadedBlobs; перед
каждым object POST — pendingObject `{ kind: blob | tree, oid }`. Unknown stage
различает uploading/creating/updating. Неизвестный blob/tree проверяется GET:
его подтверждённое наличие позволяет продолжить ещё не начатые uploads без
дублирования POST, отсутствие блокирует запись. Повтор
сверяет binding, сохранённые dates, deterministic commit и refs. Unknown не
разрешает слепой POST/PATCH, другой requestId, candidate или parents. Отчёт
сохраняет базовые безопасные поля и добавляет `mergedTree`, `remoteCommit`,
`mergeStatus: not_attempted | succeeded | unknown`. Созданный commit без
подтверждённого target ref остаётся частичным либо неизвестным результатом.
REST limits — 90 секунд на операцию, 10 секунд на запрос, 8 MiB response;
recovery blob GET — до 24 MiB. Worker timeout остаётся 120 секунд.

Локальные refs, индекс, рабочие файлы и hooks не меняются. Их актуализация
выполняется отдельно разрешённым закреплённым `pull` после remote merge.
DTO/example — в [README](../../../.ai/tools/git-delivery/README.md#контекст-merge),
критерии — [merge check](../../../.ai/checks/git/CHECK-GIT-APPROVED-TREE-MERGE.md).

## Выполнение и достаточные проверки

Общая verification orchestration принадлежит `packages/verification-runtime`
(`@realize/verification-runtime`). IDE CLI в
`.ai/tools/git-delivery/src/verification/` и platform adapter
`services/ai-execution-worker/src/checkRunner.ts` вызывают один runner, валидатор,
расчёт ключей, хранилище receipts и владелец процессов. Вход IDE
`npm run git:verify -- run|status --plan /absolute/private-plan.json` принимает
явные selected checks, команды `node`/`npm`, inputs, профиль окружения, timeout,
`reuse: local|never` и `extent: targeted|full`. Широкий/полный набор требует
конкретной причины; orchestration не выводит набор checks автоматически.
`run` сохраняет receipts и повторяет только missing/failed/stale selected checks;
при `reuse: never` команда выполняется каждый раз. `status` не выполняет команды.

До запуска checks runner сверяет Node, а для npm-команд — также npm с точными
версиями из корневого `package.json`. Несовпадение завершает запрос диагностикой до
старта checks. Окружение выбирается при запуске IDE, Codex или службы;
runner использует обычные команды `node`/`npm` из этого окружения.

Ключ отдельной проверки отличается от Git fingerprint: он связывает exact source
bytes и состав входных каталогов, command/recipe, manifests/lockfiles, metadata
установленных dependencies, runtime/platform и hash эффективного environment.
Изменение HEAD или индекса само по себе не доказывает изменение этих входов.
Результат применим только после повторной проверки ключа. Это консервативное
доказательство локального filesystem-состояния; БД, browser и live runtime
используют `reuse: never`. Независимый versioned external proof в текущий API
не входит. Секреты и значения environment в receipts не записываются; прежние
логи не импортируются как автоматически выполненные проверки.

Receipts сохраняются атомарно через общий `PrivateJsonRepository`: ограниченный
размер, запрет symlinks, descriptor IO и `fsync`. IDE использует namespace
`tasks/<taskId>/logs/git-verification` внутри `.ai-workspace`; Git journals и
OID proofs остаются у policy adapter `GitJournalRepository`. Платформа назначает
`.ai-workspace/runtime/verification` в исходном host repository, вне candidate
worktree. Адрес хранилища задаёт доверенный adapter, а не JSON-план.
Verification lock отделена от Git lock: ожидание
и выполнение тестов не блокирует общую Git-фазу. Новый сервис, БД и фоновый
процесс для этой orchestration не нужны.

Платформа получает checks из одобренного плана. `lint`, `format:check` и
`typecheck` допускают reuse; `build`, БД, browser, integration tests и проверка
секретов требуют выполнения. Сборке нужны выходные файлы, external checks зависят
от внешнего состояния, а secrets check — ещё и от Git membership.
Для статических checks учитывается всё дерево исходников, включая новые файлы
верхнего уровня, с фиксированными исключениями runtime/build artifacts. Для
typecheck дополнительно учитываются `.next/types` и `.next/dev/types`.

Обычный receipt привязан к рабочему корню. Перенос результата между execution
и preview разрешён только с capability, которую выдаёт общий materializer после
реального копирования dependencies. Он проверяет исходный inventory до и после
копирования и inventory копии; при использовании сверяет копию повторно.
Переносимый ключ связывает происхождение dependencies и одинаковые source bytes,
recipe, runtime и environment. Публичное поле с произвольным digest не заменяет
эту capability. Разные project/task/approved plan не заимствуют результаты.
Это cooperative filesystem contract, а не атомарный snapshot или sandbox.

Публичный `WorkerCheckResult` и approvals сохраняют прежний контракт; безопасный
`outputSummary` отмечает reuse, время и usage относятся к текущей операции.
Общий runner завершает дочерние процессы при timeout/abort и ограничивает вывод.
Product authorization, сохранение check results и usage остаются у execution
и promotion owners; Git fingerprint и OID proofs остаются у IDE adapter.
GPT/MCP использует тот же platform путь, когда запрос принят как одобренная
execution job; repository read tools сами по себе проверки не запускают.

`REALIZE_GIT_VERIFICATION_PLAN` включает этот этап перед `git:worker commit|push`.
Контекст пользователя по-прежнему отдельно задаёт действие, scope, requiredChecks,
inputPaths, identity и target; разрешения проверяются до команд и моделей.
Пустые/отсутствующие results допустимы лишь на структурной стадии autoload,
затем применяется полная проверка evidence. Снимки Git для привязки receipts
выполняются через тот же программный адаптер inspect. Для commit receipts перепроверяются между двумя
inspect и связываются с совпавшим текущим fingerprint; low-level handler
повторно сверяет этот снимок под lock, не запуская тесты самостоятельно.
Verification inputPaths могут включать дополнительно исходные файлы плана и
обязательные входы runner; область авторизации commit при этом не меняется.
Состав файлов повторно сверяется при подготовке. Это cooperative filesystem
contract: handler проверяет включённые файлы, но атомарного snapshot dependencies,
environment и последующего состава каталогов не создаёт.

Proof для push появляется только после подтверждённого commit и связан с точным
OID/check recipe. Отсутствующий proof старого OID нельзя получить запуском тестов
нынешнего checkout. Recovery не превращает неподтверждённый или частичный commit
в успешное evidence. Без verification-плана ручной контракт сохраняется.
Selected check с `reuse: never` требует текущего запуска для commit и блокирует
автоматический push с `verification_not_reusable` до модели и сети; сохранённый
OID proof не доказывает актуальное внешнее состояние. Ручной маршрут с evidence
точных OID остаётся доступен без verification-плана.
Формат плана и команды — в
[README обработчика](../../../.ai/tools/git-delivery/README.md#сохранение-и-повторное-использование-проверок).

Далее low-level обработчик выполняет только разрешённую Git-операцию:

1. Проверить вход и разрешение. Получить блокировку по общему каталогу Git
   для связанных worktree; индекс проверяется в конкретной рабочей копии.
2. Прочитать ветку, HEAD, индекс и рабочие изменения. Зафиксировать состав,
   содержимое, разрешённые коммиты и назначение. Конфликты слияния, неподходящая
   ветка и посторонний индекс блокируют соответствующее действие.
3. Для действия с commit сопоставить результаты проверок с текущим содержимым.
   Результат проверки содержит её идентификатор, фактический статус и отпечаток
   проверенного состояния, включая значимые конфигурацию и зависимости.
   Недостающие проверки выбираются по изменению; полный набор ради Git не нужен.
4. До первой записи Git устойчиво сохранить исходные HEAD, индекс, разрешение
   и назначение операции. Подготовить только разрешённые пути. Проверить итоговое
   содержимое индекса и соответствие проверенному состоянию. До создания commit
   устойчиво сохранить подготовленное дерево, сообщение и авторство, затем
   создать commit и обновить запись его хешем. Перед push сверить полученное
   дерево с проверенным: hooks могут менять индекс. Обязательные hooks и
   CI-проверки не отключаются ради ускорения.
5. Для действия с push использовать выбранный транспорт и явную ветку.
   Проверить весь публикуемый набор коммитов: push может отправлять накопленную
   историю, а не только последний commit. Выполнить обычный push без force.
6. Установить результат, сохранить короткую запись для продолжения, освободить
   блокировку и вернуть отчёт. При необходимости уточнить удалённую ссылку;
   успешное чтение репозитория само по себе не доказывает право записи.

`inspect` заканчивается после локального чтения и возврата сводки; ему не нужны
тесты и запись для восстановления доставки. Для `push` шаги staging, commit и
повтор тестов отсутствуют; назначение и разрешённый commit сохраняются до
сетевой записи. При `commit_push`
ошибку конфигурации подключения по возможности выявляют до создания commit.
Отдельная полная проверка подключения выполняется при настройке или диагностике,
а не как повторяемый набор сетевых запросов перед каждой доставкой.

Блокировка координирует экземпляры обработчика, но не запрещает пользователю
редактировать файлы. Изменение HEAD, индекса или выбранного содержимого после
проверки обнаруживается повторным сравнением перед записью; старые результаты
не приписываются новой версии. Обработчик не очищает чужой индекс и не выполняет
автоматические stash, reset, rebase, generic local merge или исправления кода.
Синхронизация pull имеет отдельный фиксированный путь fast-forward;
approved-tree merge — отдельный закреплённый REST contract выше.

Перед моделью оказываются только необходимые безопасные сведения. Сначала
передаётся сводка; новые фрагменты diff читаются адресно. Большие бинарные
материалы не превращаются в текст задания. Данные файлов и вывод Git не могут
расширять полномочия воркера. Лимиты времени и вывода задаёт исполнитель.

## Результат и повтор после сбоя

Внешний ответ `git:worker` сохраняет `version: 1`, `status`, `errorCode`,
`result`, `command` и структуру `worker`. Программный `inspect` возвращает
поля `worker.model`, `worker.threadId`, `worker.turnId` как `null`,
`worker.instructionBytes: 0`,
`worker.usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }`,
фактические `worker.handlerCalls` и `worker.durationMs`. Эти поля отражают отсутствие модели;
идентификаторы модельной сессии не имитируются.

Результат обработчика JSON версии `1` содержит:

| Поле                   | Контракт                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ |
| `requestId`, `action`  | Связь с исходной командой                                                      |
| `status`               | `succeeded`, `noop`, `partial`, `blocked` или `failed`                         |
| `branch`, `commit`     | Установленные значения либо `null`, если неизвестны                            |
| `commitCreated`        | Создан ли commit именно этой операцией; `null`, если после сбоя это неизвестно |
| `fingerprint`          | Отпечаток снимка для привязки результатов проверок, либо `null`                |
| `changes`              | Ограниченная сводка путей и статусов; при сокращении явно указан `truncated`   |
| `pushStatus`           | `not_requested`, `not_attempted`, `succeeded`, `failed` или `unknown`          |
| `checks`               | Краткие фактические результаты и сведения о повторном использовании            |
| `errorCode`, `summary` | Стабильная причина и короткое объяснение без секретов                          |
| `retryable`            | Разрешён ли безопасный повтор этой же операции                                 |

`noop` означает, что запрошенное состояние уже достигнуто. Отсутствие новых
файлов не отменяет разрешённую публикацию ранее созданных коммитов.
`partial` отражает выполненную часть операции, например созданный commit при
неудачном push. При обрыве связи после отправки результат push может быть
`unknown`; его нельзя объявлять неуспешным или успешным без проверки.

Минимальная запись изменяющей операции сохраняется в каталоге задачи `.ai-workspace/`
и связывает `requestId`, разрешение, исходное состояние, назначение, полученный
commit и результат push. Запись обновляется атомарно по выполненным этапам;
сохранение должно завершаться до следующего побочного эффекта. Секреты и полная
история диалога не сохраняются.
Отдельная БД заданий и постоянный Markdown-отчёт на каждый запуск не нужны.

`taskId` связывает журнал с рабочим контекстом и не требует управляемого TASK.
Для короткой самостоятельной операции достаточно собственных context и журнала;
выбор досье регулирует [правило материалов](../../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md#выбор-рабочего-контекста),
размещение и ограниченную очистку —
[README обработчика](../../../.ai/tools/git-delivery/README.md#короткая-операция-и-рабочий-контекст).
Утрата временного контекста не удаляет журнал и не разрешает новый requestId
для обхода неизвестного исхода.

Повтор с тем же `requestId` сверяет сохранённую запись и фактическое состояние.
Он не создаёт второй commit и не захватывает новые правки. Если сбой произошёл
между commit и записью результата, исполнитель устанавливает соответствие
через сохранённые исходный HEAD и подготовленное дерево; неоднозначность
блокирует повторную запись. Завершившийся push обнаруживается по назначению
и коммиту. Потеря записи не разрешает слепой повтор операции.

Явно разрешённое исправление до подготовки дерева commit может обновить
проверенный снимок той же операции через `recovery: { attempt, previousFingerprint }`.
Исходное назначение, авторство, сообщение, scope и состав обязательных проверок
остаются привязанными к прежнему requestId. Обновляются результаты проверок;
legacy binding исключает их и recovery, сохраняя прежнюю сериализацию остальных полей.
Журнал хранит исходный снимок и последнее принятое поколение до следующего `add`.
Принадлежность старого индекса доказывается отдельно от проверки секретов:
это разрешает исправление отвергнутых данных, но не их публикацию. Новый снимок
проверяется до staging, подготовленные объекты — после. Частичный индекс вне
предыдущего состава, смена HEAD и наличие preparedTree блокируют такое обновление.
Номер поколения назначает вызывающая среда, не модель; повторы сохраняют
принятый снимок и не создают второго commit. Точный формат, предел и ограничения —
в [контракте восстановления](../../../.ai/tools/git-delivery/README.md#восстановление-локального-commit).

Ошибки авторизации, конфликты, отказ защиты ветки и неизвестная модель не
повторяются циклически. Для сетевых ошибок допустим ограниченный повтор после
выяснения состояния; число попыток и срок ограничены конфигурацией.

## Внедрение небольшими шагами

Явный полный add/commit получает отдельное поле доверенной области
`{ mode: "all", includePartialIndex: true }`. Только оно разрешает заменить
частично подготовленные версии файлов их проверенными текущими рабочими bytes.
Без поля и для адресного scope прежняя блокировка сохраняется. Решение принимает
вызывающая среда по явному запросу пользователя, не Git-модель. Поле входит в
operation binding; старое задание нельзя расширить им при повторе. Снимок,
secrets, staged bytes, hooks и exact-tree verification остаются обязательными.

- [x] Зафиксировать команды, доверенный контекст, подключения и результат.
- [x] Согласовать Git-правило, процесс, checks и Codex-навык: обязательный
      разрешённый адаптер, отсутствие истории диалога, HTTPS/SSH и единый владелец каждого требования.
- [x] Реализовать локальные части обработчика и формат результата без сетевой
      публикации; проверить область изменений, индекс и повтор после сбоя.
- [x] Выделить общее серверное получение подключения из существующей интеграции
      и перевести на него действующих source/release-потребителей.
- [x] Расширить существующую интеграцию выбором транспорта; подключить HTTPS и
      SSH к Git-обработчику с профильными проверками.
- [x] Подключить программный `inspect` через validator/delivery/handler/runtime
      contracts без модели; сохранить validation, fingerprints и evidence.
- [x] Подключить commit к воркеру с контекстом разрешённой области записи и проверок от вызывающей среды.
- [x] Подключить отдельный push к воркеру с точным набором коммитов и журналом.
- [x] Проверить расширение manage/fetch/pull: ограничения capabilities,
      журналы, локальные guards, scoped fetch и fast-forward на изолированных репозиториях.
- [x] Проверить расширение approved-tree merge: context/capability, точный tree diff,
      bounded bytes, секреты и hashes до upload, exact blobs/tree POST,
      pinned refs, два ordered parents, deterministic replay, частичный/unknown
      результат и отсутствие локальных побочных эффектов на изолированных фикстурах.
- [ ] Добавить объединённый `commit_push` с восстановлением между локальным и сетевым этапами.
- [ ] Проверить разрешённую доставку обоими транспортами на реальных подключениях и измерить обращения
      к модели, объём контекста, число команд и время выполнения.

Активные [Git-правило](../../../.ai/rules/git/RULE-GIT-DELIVERY.md), процесс,
проверки и навык согласованы с контрактом. Доступность вызова отражается в
[навыке Codex](../../../.codex/skills/git-commit-push/SKILL.md): описаны программный
`inspect`, модельные локальный `commit`, отдельный `push`, `manage`, `fetch`, `pull`
и approved-tree `merge`. Интерфейсы и пределы
реализации описаны в README обработчика. ADR остаётся целевым описанием всей
архитектуры; он не подтверждает работу ещё не подключённых частей. HTTPS source promotion по
[ADR-0013](ADR-0013-github-pull-request-source-promotion.md) сохраняет свои границы.

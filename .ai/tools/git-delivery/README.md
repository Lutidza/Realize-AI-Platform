# Обработчик Git-операций

Программная часть [ADR-0016](../../../documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md).
Через отдельного Git-воркера выполняются `inspect`, локальный `commit`, `push`,
`manage`, `fetch`, `pull` и GitHub `merge` проверенного дерева. Git transport
получает подключение из БД интеграций и использует HTTPS-токен либо SSH-профиль;
pull допускает только fast-forward. Merge использует отдельный REST credential
того же владельца интеграций.
Объединённый `commit_push` пока недоступен. Прямой локальный CLI сохраняет только
`inspect`/`commit`; сетевое действие подключено через вход воркера.

Обычные операции агента проходят через [Git-навык](../../../.codex/skills/git-commit-push/SKILL.md).
Ни модель, ни основной агент не должны самостоятельно создавать себе разрешение
на запись. Доступный вход чтения не расширяет разрешённую пользователем задачу.

## Git-воркер

Для server-to-server MCP предусмотрен отдельный ограниченный machine read port
по [ADR-0017](../../../documentation/architecture/decisions/ADR-0017-internal-mcp-and-server-management.md).
Он размещается у этого обработчика, выполняет только status/diff и служебную
проверку metadata с доверенными root/scope/deadline и проверяет пути до чтения
bytes. Индекс, hooks, сеть и delivery не затрагиваются; модель на каждый read RPC
не запускается. Доступность
порта подтверждается его реализацией и protocol tests. Development-агент
не использует его вместо описанного ниже inspect через отдельного воркера.

Уточнение MCP `1.3.1` от 20 октября 2026 года проверено на bootstrap и через
Realize AI ChatGPT connector. Внутренний helper этого owner читает HEAD/branch для
`realize_get_context` без content snapshot. Context отдельно сообщает
доступность filesystem/Git и возвращает `dirty:null`,
`dirtyStatus:"not_checked"`; это не доказательство чистоты рабочей копии.
Публичный Git tool для HEAD не добавляется, `.git` через file reader закрыт.

Снимки остальных действий сохраняют свои контракты:

- `repo_git_status` хеширует все разрешённые bytes до пагинации; `limit`
  уменьшает ответ, но не область снимка. Ограниченное параллельное чтение
  и повторное использование проверенных directory descriptors не ослабляют
  policy, проверки ссылок, cancellation и лимиты.
- `repo_git_diff` снимает разрешённые точные paths до/после чтения и сохраняет
  content identities, полные hunks и `CONFLICT` при изменении снимка.
- Development `inspect`/commit используют отдельный fingerprint из
  `src/repository.ts`, связывающий HEAD/ветку, индекс и bytes проверенных файлов.
  MCP status hash и лёгкий context не заменяют этот fingerprint.

Ошибки `TIMEOUT` Git и `FORBIDDEN` конкретного пути не объявляют весь MCP
недоступным. Контракт диагностики и версий —
[спецификация MCP](../../../documentation/specifications/internal-mcp.md#9-контракты-инструментов-a);
правила интерпретации для агента —
[MCP tooling contour](../../rules/external-tools/RULE-MCP-TOOLING-CONTOUR.md).

Из корня проекта после установки зависимостей и подготовки профиля:

```sh
REALIZE_GIT_CODEX_HOME=/absolute/authorized-codex-profile npm run --silent git:worker -- inspect
```

Для всех действий вызывающая среда обязана явно
назначить `REALIZE_GIT_CODEX_HOME`: непустой абсолютный путь без NUL к каталогу
development-профиля Codex CLI. `/absolute/authorized-codex-profile` в примерах —
placeholder; оператор заменяет его на существующий каталог с заранее
настроенной авторизацией. Adapter не проверяет существование каталога и не
читает содержимое credentials.

[Git environment adapter](src/worker/createGitWorkerEnvironment.adapter.ts)
формирует `{ ...createCodexEnvironment(source), CODEX_HOME: source.REALIZE_GIT_CODEX_HOME }`.
Если значение отсутствует, пустое, относительное или содержит NUL, запуск
блокируется до создания процесса с `PolicyError` / `worker_profile_invalid`.
Профиль не выбирается из унаследованных `HOME`, `CODEX_HOME` или API keys;
`CODEX_HOME` и ключи не наследуются общим фильтром окружения. Профиль относится
к development Git worker; авторизация продуктовой интеграции остаётся у её
владельца и не меняется этим adapter.

Нужен установленный Codex CLI. Текущая модель — `gpt-5.6-luna`, уровень
рассуждения — `low`; доступность проверяется через `model/list` перед запуском.
Используется существующий `tsx` и общий транспорт
`@realize/codex-adapter/rpc`, без нового SDK или установки зависимостей.
[Профили inspect](../../../.codex/agents/delivery/git/inspect.json),
[commit](../../../.codex/agents/delivery/git/commit.json),
[push](../../../.codex/agents/delivery/git/push.json),
[manage](../../../.codex/agents/delivery/git/manage.json),
[fetch](../../../.codex/agents/delivery/git/fetch.json),
[pull](../../../.codex/agents/delivery/git/pull.json) и
[merge](../../../.codex/agents/delivery/git/merge.json) задают модель,
уровень рассуждения и время ожидания; это конфигурация проектного механизма
запуска, а не встроенный формат агента Codex.

Вход принимает `inspect`, `commit [message]`, `push`, `manage`, `fetch`, `pull` или `merge`;
сообщение допустимо только для commit.
Корень определяется по размещению инструмента. Обычный `inspect` получает
контекст чтения всей рабочей копии в памяти. Для адресного чтения и разрешённого
commit/push/manage/fetch/pull/merge вызывающая среда передаёт отдельный контекст, описанный ниже.

Механизм запуска создаёт новую ephemeral-сессию Codex App Server и предоставляет
инструменты выбранного действия. Модель остаётся в режиме чтения файлов;
операции выполняет только обработчик по проверенному вызову инструмента назначенного действия.
Проверяются модель, сессия и ограничения доступа.
Shell, web, MCP, приложения, плагины и делегирование отключены; список MCP
проверяется до обращения к модели. Модель получает только
[инструкцию inspect](../../../.codex/prompts/workflows/delivery/git/inspect.md),
[commit](../../../.codex/prompts/workflows/delivery/git/commit.md),
[push](../../../.codex/prompts/workflows/delivery/git/push.md),
[manage](../../../.codex/prompts/workflows/delivery/git/manage.md),
[fetch](../../../.codex/prompts/workflows/delivery/git/fetch.md),
[pull](../../../.codex/prompts/workflows/delivery/git/pull.md)
или [merge](../../../.codex/prompts/workflows/delivery/git/merge.md) и команду;
AGENTS, правила, workflow, навыки и история не загружаются.
Это исключение ограниченных воркеров из
[Git-правила](../../rules/git/RULE-GIT-DELIVERY.md), которое основной агент
применяет до запуска. Инструкция не заменяет программные ограничения.
Обработчик вызывается только по запросу воркера. Повтор получает тот же результат,
не запуская обработчик повторно. Основному агенту возвращается сохранённый результат
обработчика, а не JSON, составленный моделью.

Ответ содержит `status`, `errorCode`, фактический `result`, эффективную `command`
и `worker`: фактическую модель,
идентификаторы, длительность, число вызовов обработчика, размер инструкций и
доступную статистику токенов. Коды выхода: `0` — успех, `2` — блокировка,
`1` — ошибка. Сырые сообщения Codex и stderr не выдаются.
При недоступной модели или несоответствии конфигурации автоматической замены нет.

Лимит сессии модели: 60 секунд для inspect/commit, 120 секунд для push/manage/fetch/pull/merge.
Процесс закрывается в любом
исходе; уже начавшаяся операция завершается по собственным лимитам обработчика,
поэтому общее время может превышать таймаут модели. При обрыве воркера его статус
не становится успешным даже при отдельно полученном `result` операции.
Commit, push, fetch, pull, merge и изменяющий manage используют общий файловый журнал
с разными схемами; inspect и читающий manage его не создают.
Дополнительные БД, сессия для продолжения и Markdown-отчёт на каждый вызов не нужны.

## Короткая операция и рабочий контекст

Выбор между короткой операцией, продолжением задачи и новым досье принадлежит
[правилу материалов](../../rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md#выбор-рабочего-контекста).
Обычный самостоятельный add/commit/push не требует TASK, artifact-manifest,
result или вызовов task-workspace. `taskId` связывает служебные файлы с контекстом
работы; существование управляемого досье обработчик не требует.

Для самостоятельной операции вызывающая среда выбирает отдельный безопасный
`taskId` в уже допустимой `.ai-workspace/tasks/`, без создания TASK. Личный контекст
размещается, например, в `tasks/<taskId>/tmp/git-delivery/<requestId>/context.json`
относительно `.ai-workspace`, с правами `0600`; `REALIZE_GIT_CONTEXT_FILE`
получает абсолютный путь. Необходимые каталоги принадлежат этой операции.
Прежний путь журнала сохраняется:
`.ai-workspace/tasks/<taskId>/logs/git-delivery/<requestId>.json`.
Обычный inspect использует контекст в памяти и не создаёт журнал.

Для действия продолжающейся задачи используется её `taskId` и допустимый
незавершённый каталог. Готовые зарегистрированные деревья не дописываются;
завершённое досье не меняется молча ради доставки. Такой случай использует
отдельный операционный контекст по правилу материалов.

Владелец временного контекста — создавшая его вызывающая среда. После подтверждённого
завершения операции и её потребителей она может удалить только собственный
точный файл и ставший пустым собственный каталог, если контекст больше не нужен
для evidence или восстановления. Символьные ссылки не обходятся, чужие файлы
не удаляются. При неизвестном исходе сохраняются исходные context, requestId
и журнал; успешность push не выводится из удаления context или завершения воркера.
Журнал не удаляется вместе с временным контекстом; общего cleanup/close/archive
этот маршрут не запускает. Для управляемого досье сохраняются его guards и retention.

Отдельный Git-воркер, разрешения, checks/hooks и восстановление выбранного действия
применяются полностью. Здесь меняется объём служебного оформления, а не полномочия
или протокол Git. Файловая граница context/журнала проверяется изолированно
в [GitJournal.repository.test.ts](test/GitJournal.repository.test.ts), без настоящего push.

## Контекст manage

Назначь `REALIZE_GIT_CONTEXT_FILE` и передай `npm run --silent git:worker -- manage`.
Модель получает только `git_manage({})`. Контракт
[GitManageContext](src/manage/GitManage.types.ts) принимает общие поля `version: 1`,
`requestId`, `projectId`, `taskId`, абсолютный `repositoryRoot`,
`authorization: { "actions": ["manage"], "scope": { "mode": "repository" } }`
и ровно одну `operation`. Незнакомые поля отклоняются. Пример контекста чтения:

```json
{
  "version": 1,
  "requestId": "remote-inspect-1",
  "projectId": "realize-ai-platform",
  "taskId": "repository-rename",
  "repositoryRoot": "/absolute/checkout",
  "authorization": { "actions": ["manage"], "scope": { "mode": "repository" } },
  "operation": { "kind": "remote-inspect", "remote": "origin" }
}
```

Значения примеров заменяет вызывающая среда по фактическому запросу пользователя.

| `operation.kind`  | Остальные поля и действие                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `remote-inspect`  | `remote`: точное имя; безопасные fetch/push URL без сети                                                                          |
| `remote-set-url`  | `remote`, `expectedURL`, `url`: сверка прежнего URL и локальная смена GitHub repository name с тем же владельцем и транспортом    |
| `worktree-list`   | Без дополнительных полей; ограниченный список зарегистрированных worktrees                                                        |
| `worktree-repair` | `paths`: 1–100 точных абсолютных путей из `authorization.externalWorktrees`                                                       |
| `branches-list`   | Без дополнительных полей; локальные ветки и HEAD                                                                                  |
| `branch-create`   | `name`, обязательный `switch: boolean`: новая ветка от ожидаемого HEAD; по флагу переключение                                     |
| `branch-switch`   | `name`: существующая локальная ветка                                                                                              |
| `log`             | `limit`: 1–100 записей; OID и subject                                                                                             |
| `diff`            | `scope: "index"` либо `"working-tree"`, `paths`: до 100 точных относительных путей, `contextLines`: 0–20, `limitBytes`: 1–1048576 |

Для записей обязателен `expected: { "head": "<40-char OID>", "branch": "main" }`;
при detached HEAD поле `branch` равно `null`. Для чтения expected необязателен.
Создание и переключение ветки требуют чистого индекса и рабочей копии.
Skip-worktree/assume-unchanged flags и незавершённые Git-операции блокируют их;
переключение использует `--no-guess --no-recurse-submodules --no-overwrite-ignore`.
`log`, `diff`, создание и переключение веток отклоняют partial clone:
`remote.*.promisor` и `extensions.partialClone` могут включить неявную сеть.
Чтение remote, списка веток и worktree metadata остаётся доступным.
Diff с пустым paths читает набор tracked-файлов. Проверяются полные исходные
bytes без textconv/filters: обычные файлы до 1 MiB каждый, суммарно до 16 MiB
и 2000 файлов. Binary, symlink, submodule и unmerged данные блокируются.
`externalWorktrees` допустим только для repair; каждый путь операции должен
входить в этот список; paths должен покрывать весь существующий зарегистрированный
внешний набор, который затрагивает штатный repair. Неполный список блокируется с
`manage_worktree_scope_invalid`: выборочный repair после переноса основной копии
Git не гарантирует. Метаданные отсутствующих каталогов сохраняются без prune/create;
существующий каталог с недопустимым `.git` или symlink блокируется.
Repair выполняется из основной рабочей копии и поддерживает
перенос её корня с прежними путями связанных worktrees. Перенос внешнего worktree
требует отдельного контракта; существующая metadata должна указывать на разрешённый
путь. Изменение GitHub, БД интеграции и перенос файлов выполняют их владельцы.
Отдельный старый `pushurl` блокирует rename remote вместо скрытого изменения.

Запись сохраняет binding контекста, before и ожидаемое after в журнал до Git.
Повтор с тем же requestId сверяет журнал: достигнутое after даёт `noop`,
подтверждённое before допускает прежнюю запись; другое состояние блокирует её.
Результат содержит обычные безопасные поля и `details` выбранной операции.
Diff, subjects и URLs проверяются на секреты и ограничиваются до передачи модели.
При лимите или неоднозначности обработчик возвращает блокировку, а не полный успех.

## Контекст fetch и pull

Назначь `REALIZE_GIT_CONTEXT_FILE` и передай `npm run --silent git:worker -- fetch`
либо `npm run --silent git:worker -- pull`. Модель получает только `git_fetch({})`
или `git_pull({})`. Контракт
[GitSyncContext](src/sync/GitSync.types.ts) сохраняет общие поля запроса;
authorization разрешает ровно выбранное действие с `scope: { "mode": "repository" }`.

```json
{
  "version": 1,
  "requestId": "fetch-1",
  "projectId": "realize-ai-platform",
  "taskId": "repository-sync",
  "repositoryRoot": "/absolute/checkout",
  "authorization": { "actions": ["fetch"], "scope": { "mode": "repository" } },
  "target": {
    "connectionKey": "github:primary",
    "connectionRevision": 1,
    "repositorySlug": "example/project",
    "transport": "https",
    "branch": "main",
    "sourceOid": "1111111111111111111111111111111111111111",
    "remoteOid": "2222222222222222222222222222222222222222"
  }
}
```

Хеши примера условные. SourceOid — текущий локальный HEAD, remoteOid — заранее
установленный commit разрешённой удалённой ветки; оба обязательны, ненулевые,
одинаковой длины 40 или 64 hex. Для pull поле actions содержит только `"pull"`.
Произвольные URL, refspec, режимы merge, identity и evidence commit не принимаются.

Обработчик сверяет HEAD/ветку, отсутствие незавершённых Git-операций, полную
историю без shallow/replace/grafts/partial clone и текущую ревизию подключения.
Fetch проверяет удалённую ветку до/после обмена и получает закреплённый remoteOid
в `refs/remotes/realize-sync/<branch>` без tags/prune/submodules.
Прежний OID этой ссылки сохраняется под общим lock; после получения объектов
и проверки типа commit ссылка обновляется через CAS. Fetch не пишет FETCH_HEAD.
Текущие HEAD, индекс и рабочие файлы сохраняются. Эта ссылка остаётся доступной
в результате fetch; повтор подтверждает тот же OID без нового сетевого запроса.

Pull дополнительно требует чистого состояния, включая untracked, и отсутствия
index skip-worktree/assume-unchanged flags. Gitlinks в текущем индексе блокируются
до сети, в полученном дереве — до применения. Fetch может получать commit с
gitlinks, сохраняя запрет на вложенный checkout. После fetch допускается только
`merge --ff-only --no-edit --no-autostash` к закреплённому commit. Затем только
служебная ссылка закреплённой ветки удаляется через CAS. Pull не создаёт merge commit,
не делает stash/rebase и не запускает автоматическое исправление конфликтов.

Журнал фиксирует `prepared/fetching/fetched/applying/succeeded/unknown` до этапов
записи и хранит `previousOid: string | null`. Повтор сверяет binding и фактический полученный commit; выполненный fetch
или fast-forward не запускается заново. При неизвестном результате повтор не
расширяет назначение до новой версии upstream. Неожиданное изменение служебной
ссылки блокирует запись; число ссылок зависит от числа веток, а не запросов.
Результат содержит `fetchedCommit`,
`trackingRef`, `syncStatus` и безопасную `diagnostic`, когда она доступна.
`partial` означает возможную выполненную часть; `unknown` требует сверки состояния.
Сценарий настройки и получения исходного remoteOid не заменяет разрешение pull.

## Контекст merge

Назначь `REALIZE_GIT_CONTEXT_FILE` и передай `npm run --silent git:worker -- merge`.
Модель получает только `git_merge({})`; CLI message для этой action недопустим.
[GitMergeContext](src/merge/GitMerge.types.ts) разрешает одно действие `merge`
с `scope: { "mode": "approved-tree" }`. Подготовка и review candidate tree,
разрешение конфликтов и выбор точных изменённых путей принадлежат вызывающей
среде до запуска; обработчик не выполняет generic local merge.

```json
{
  "version": 1,
  "requestId": "merge-1",
  "projectId": "realize-ai-platform",
  "taskId": "search-merge",
  "repositoryRoot": "/absolute/checkout",
  "candidateSourceRoot": "/absolute/checkout/.ai-workspace/tasks/search-merge/tmp/candidate",
  "authorization": {
    "actions": ["merge"],
    "scope": { "mode": "approved-tree" }
  },
  "target": {
    "connectionKey": "github:primary",
    "connectionRevision": 1,
    "repositorySlug": "example/project",
    "repositoryID": 1234567,
    "ref": "refs/heads/main",
    "oid": "1111111111111111111111111111111111111111",
    "treeOid": "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
  },
  "source": {
    "ref": "refs/heads/task/search",
    "oid": "2222222222222222222222222222222222222222"
  },
  "candidate": {
    "treeOid": "cfaad775d4966e12054e28c35f7c820606e019bd",
    "approvedChangedPaths": ["documentation/search.md"],
    "files": [
      {
        "path": "documentation/search.md",
        "mode": "100644",
        "blobOid": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
      }
    ]
  },
  "identity": { "name": "Project Owner", "email": "owner@example.com" },
  "message": "merge: принять проверенный search contract",
  "verification": {
    "requiredChecks": ["candidate-review"],
    "results": [
      {
        "id": "candidate-review",
        "status": "passed",
        "fingerprint": "b97f7eb7cff99c9d973aaa193e2cf0c8d56dcfedaa26eec410f27db2cbfe349f"
      }
    ]
  }
}
```

Репозиторий и commit OID в примере условные. Target tree — пустое Git tree;
candidate добавляет пустой `documentation/search.md`, blob/tree SHA соответствуют
этим bytes. Запись `passed` не является evidence выполненной проверки.
Target/source — разные точные `refs/heads/*`
и разные ненулевые 40-hex commit OID; treeOid также GitHub SHA-1. Revision и
repository ID — положительные safe integers. `approvedChangedPaths` задаёт
точные относительные конечные пути без дублей; validator канонизирует сортировку.
Пустой список разрешён, если candidate полностью сохраняет target tree.
`candidate.files` ровно покрывает approvedChangedPaths descriptors `{ path,
mode, blobOid }`; новый файл имеет mode `100644` либо `100755` и ненулевой
blobOid, удаление — только `mode: null, blobOid: null`. Symlink/gitlink uploads
не принимаются; удаляемый файл должен отсутствовать в candidate source.
Канонический absolute candidateSourceRoot ограничен
`<repositoryRoot>/.ai-workspace/tasks/<taskId>/tmp/**`; это источник только
assigned approved bytes, а не путь к произвольному checkout или файловой системе.
Identity обязательна, message — строка 1–4096 символов; неизвестные поля и
дополнительные действия отклоняются.

Вызывающая среда проверяет candidate bytes, сохранение принятой работы и
применимые проверки по изменению. Все requiredChecks должны иметь `passed`
и fingerprint из [hashGitMergeCandidate](src/merge/hashGitMergeCandidate.util.ts):
SHA-256 канонических target/source/candidate metadata, включая
candidateSourceRoot и file/blob descriptors. Смена parent, target tree,
candidate tree, источника bytes, назначения, mode/blobOid или списка путей
отменяет evidence. Dependency/build cache проверяющего исполнителя находится
вне approved paths; результаты сборки не становятся дополнительными overlays.
Обработчик не запускает тесты приложения вместо исполнителя и не передаёт
raw blobs модели, в журнал или отчёт.

Общий resolver возвращает GitHub API credential; transport/SSH profile не
передаются в merge context. Проверяются текущие integration revision/slug,
repository ID и refs. Target commit должен ссылаться на назначенный target tree.
GET recursive trees возвращает полный target manifest: неверный SHA,
`truncated: true`, некорректные entries или более 50 000 entries блокируют запись.
Target leaf entries и accepted overlays должны вычислять ровно candidate tree
OID. До любого POST обработчик безопасно читает только назначенные файлы из
candidateSourceRoot с `O_NOFOLLOW`, проверяет path/mode, Git blob SHA и секреты.
Отказ проверки bytes, source boundary или tree SHA блокирует любые uploads.
Пределы чтения: 16 MiB на файл и 64 MiB на весь approved состав. Остальные
snapshot-файлы, dependencies, build cache и env обработчик не читает.

После сохранения journal создаются только assigned immutable blobs; возвращённый
SHA сверяется с blobOid. Tree POST получает `base_tree: target.treeOid` и ровно
approved entries; возвращённый SHA должен совпасть с candidate.treeOid. Затем
GET recursive candidate tree подтверждает полный manifest и точный scope diff:
набор изменённых конечных paths равен approvedChangedPaths, все прочие type,
mode и object SHA сохраняются. Дерево и blobs могут быть новыми; uploads
не меняют ref. Ошибка после upload может оставить immutable объекты, которые
не означают завершённое слияние.
GET отсутствующего tree допускает только точный `422 Invalid object requested` ответ до 4 KiB; прочие HTTP ошибки блокируются.
[GitHub Create a blob](https://docs.github.com/en/rest/git/blobs#create-a-blob),
[Create a tree](https://docs.github.com/en/rest/git/trees#create-a-tree),
[GitHub Get a tree](https://docs.github.com/en/rest/git/trees#get-a-tree).

Под общим lock журнал замораживает body с candidate tree, ordered parents
`[target.oid, source.oid]`, identity для author/committer, message и единой UTC
date до первого POST, включая uploads. Детерминированный unsigned commit OID позволяет сверить unknown
create без второго POST. Созданный объект проверяется по OID, tree, обоим parents,
message, identity и dates. GitHub API может убрать одну завершающую LF из
JSON message; допускается только это точное отличие при совпадении commit SHA
и остальных frozen metadata. Body и raw Git hash не нормализуются.
[GitHub Create a commit](https://docs.github.com/en/rest/git/commits#create-a-commit).

Перед PATCH обе refs должны точно совпадать с назначением. Обновляется только
target ref, с `force: false`; после запроса remote ref подтверждает созданный
commit. Это fast-forward guard с точными pre/post сверками, а не unconditional
CAS: endpoint не принимает expected old OID. Сдвиг ref и правила защиты ветки
могут блокировать запись; контракт не обходит branch protection.
[GitHub Update a reference](https://docs.github.com/en/rest/git/refs#update-a-reference).

Journal phases: `prepared/uploading/uploaded/creating/created/updating/completed/unknown`.
До первого POST сохраняются frozen body/date/expectedCommit и `uploadedBlobs`.
Перед каждым object POST записывается `pendingObject: { kind, oid }`; kind
равен `blob` либо `tree`. Unknown сохраняет `uncertainStage`
(`uploading`, `creating`, `updating`). Повтор сохраняет requestId, context и
dates, сверяет deterministic objects и refs. Неизвестный blob/tree сначала
проверяется GET: подтверждённый object позволяет продолжить только оставшиеся
не начатые uploads без повторного POST; отсутствие блокирует запись. Новое
задание, другая дата или слепая запись не заменяют разбор состояния.
REST limits: 90 секунд на операцию, 10 секунд на запрос, 8 MiB response;
recovery blob GET допускает до 24 MiB. Лимит модели остаётся 120 секунд.
Результат сохраняет безопасные
базовые поля и добавляет `mergedTree`, `remoteCommit`, `mergeStatus`
(`not_attempted`, `succeeded`, `unknown`). Созданный объект без подтверждённого
target ref не означает завершённое слияние.

Merge не меняет локальные refs, индекс, worktree или hooks и не запускает
commit/push/pull автоматически. Для локальной актуализации используй отдельно
разрешённый `pull` с закреплённым remoteOid созданного commit. PR, force,
deployment и product SourcePromotion authority в действие не входят.
Изолированная приёмка расширения merge подтверждена 30 профильными и полным
набором 588 Git regression tests. Реальная GitHub publication через модель
требует отдельной эксплуатационной проверки; состояние отражено в ADR-0016.

## Контекст локального commit

Вызывающая среда или основной агент обязаны иметь явный пользовательский запрос
на commit и его область. Они назначают `REALIZE_GIT_CONTEXT_FILE` — абсолютный
путь к личному JSON-файлу контекста версии `1` из таблицы ниже. Храни файл
в собственном `tmp/` досье или операционного контекста `.ai-workspace`, с правами
`0600`, по [правилам размещения](#короткая-операция-и-рабочий-контекст).
Файл передаёт контекст отдельно от Git-воркера, но не доказывает согласие человека
и не изолирует программы одного системного пользователя.

До запуска модели обязательны `authorization.actions: ["commit"]`, разрешённый
scope, identity и непустой набор успешных проверок для одного fingerprint.
Для явного запроса полного add/commit текущих изменений scope может содержать
`{ "mode": "all", "includePartialIndex": true }`. Это отдельное решение
вызывающей среды включить текущие рабочие bytes также для частично подготовленных
файлов. Поле принимает только `true`, запрещено в `mode: "paths"` и не назначается
моделью. Без поля действует обычный запрет partial index. Проверенный снимок,
индекс, защита секретов и контроль bytes после add сохраняются.
В этом режиме путь, чья проверенная рабочая версия совпала с HEAD, может
отсутствовать в staged diff. Для каждого пути снимка по-прежнему сверяются
наличие, mode и bytes индекса; любой staged-путь вне снимка запрещён.
Тот же контракт применяется при доказательстве принадлежности индекса
прерванной операции. Обычный режим сохраняет точный состав staged diff.
Корень контекста после `realpath` должен совпадать с корнем инструмента.
Полномочия и результаты проверок задаёт вызывающая среда. Если `identity` не
передана, загрузчик читает `configuration.commitAuthor` включённой GitHub-интеграции
из БД через `GitCommitAuthorService`, без расшифровки токена. Имя и email задаются
в форме интеграции. Явная `identity` имеет приоритет и не требует БД. Неполные
или недоступные настройки блокируют commit до запуска модели.

Для привязки проверок используй адресный `inspect` с этим же scope и
`verification.inputPaths`, действиями `["inspect"]`, без identity и с пустыми
`requiredChecks`/`results`. Выполни нужные проверки между двумя одинаковыми
fingerprint. Затем передай результаты в контексте commit; `identity` можно
опустить, если автор настроен в интеграции.
Старую проверку без такой привязки нельзя объявлять выполненной для снимка.

```sh
REALIZE_GIT_CODEX_HOME=/absolute/authorized-codex-profile \
  REALIZE_GIT_CONTEXT_FILE=/absolute/context.json \
  npm run --silent git:worker -- commit 'docs: уточнить правила'
```

С заданным сообщением воркер вызывает только `git_commit` с `{}`; текст закреплён
программно. Без сообщения он сначала получает сводку путей и статусов через
`git_inspect` в той же области, затем передаёт только `message` в `git_commit`.
Сводка не содержит diff; сообщение не должно приписывать изменениям неизвестные
детали. Пути, полномочия и результаты проверок в аргументах модели недопустимы.

Для повтора сохраняй requestId, контекст и сообщение из `command` отчёта.
Другой текст с тем же requestId блокируется как конфликт. При изменении автора
в интеграции повтор требует первоначальной `identity`, переданной явно в
контексте. Загрузчик не сохраняет её отдельно, журнал хранит только хеш
контекста: если исходный автор неизвестен, повтор блокируется. Если после обрыва
сообщение утрачено, сначала разбери журнал; новый requestId не заменяет
восстановление операции. Фактический `result`, включая созданный commit,
сохраняется даже при последующем сбое воркера.

### Восстановление локального commit

После исправления причины отказа пользователь может разрешить новый проверенный
снимок **той же операции**. Вызывающая среда сохраняет requestId, команду,
авторство, scope, `verification.inputPaths` и `requiredChecks`; заменяет только
`verification.results` результатами текущих проверок и добавляет:

```json
"recovery": { "attempt": 1, "previousFingerprint": "<отпечаток принятого снимка>" }
```

`attempt` — следующий номер после `recoveryAttempts` (отсутствие означает `0`),
от `1` до `16`. `previousFingerprint` берётся из последнего принятого
`journal.recovery.snapshot` либо исходного `journal.original`. Новые проверки
связываются с текущим содержимым через два одинаковых снимка обычного `inspect`
с прежними scope/inputPaths; в контекст inspect recovery не передаётся.

Допуск требует существующего журнала без `noop`, commit и любого `preparedTree`:
этот механизм не меняет содержимое после возможного запуска commit hooks.
HEAD, ветка и рабочая копия остаются прежними. Индекс должен совпадать с индексом
последнего принятого снимка либо точно с его подготовленным содержимым. Только
для доказанно принадлежащих операции путей допустимо исправление частичного
индекса; посторонние staged-изменения блокируют запись.

Исходный снимок сохраняется; новое поколение записывается атомарно до `add`.
В него входят только заново проверенные изменения в прежней разрешённой области.
Повтор принятого номера использует тот же previousFingerprint, содержимое и
проверки; изменённые данные требуют следующего разрешённого поколения. После
обрыва сверяются индекс и журнал, второй commit не создаётся. Без recovery
продолжение принятого поколения блокируется; существующий commit сверяется
и возвращает `noop`. Журнал и индекс вручную не исправляются.

Явные секреты проверяются в рабочих данных до `add` и в staged-объектах после
него. Синтетические credentials тестов формируются в памяти; исключений из
детектора для тестов нет. Если исправление вернуло staged-файл точно к HEAD,
явный режим полного снимка сверяет его индексные bytes с принятым снимком,
даже когда путь исчез из staged diff. Обычный режим сохраняет точный состав
diff и может остановить такую операцию.

## Контекст push

```sh
REALIZE_GIT_CODEX_HOME=/absolute/authorized-codex-profile \
  REALIZE_GIT_CONTEXT_FILE=/absolute/push-context.json \
  npm run --silent git:worker -- push
```

Файл имеет те же ограничения доступа, что контекст commit. Общие поля:
`version: 1`, `requestId`, `projectId`, `taskId`, `repositoryRoot`.
Остальные поля отдельного контракта:

| Поле                          | Значение                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `authorization.actions`       | Только `["push"]`                                                                                                          |
| `authorization.scope`         | `{ "mode": "commits", "commits": [...] }`: точный набор `sourceOid` минус история `remoteOid`                              |
| `target`                      | `connectionKey: "github:primary"`, `connectionRevision`, `repositorySlug`, `transport`, `branch`, `sourceOid`, `remoteOid` |
| `verification.requiredChecks` | Непустой набор применимых проверок                                                                                         |
| `verification.results`        | Для каждой пары проверка/коммит один `{ "id": "…", "status": "passed", "commit": "…" }`                                    |

`remoteOid: null` разрешает создание отсутствующей ветки. OID — полные хеши;
`sourceOid` должен совпадать с HEAD назначенной локальной ветки. В разрешение
входят также ранее созданные, ещё не опубликованные коммиты. Повторное использование
результата для другого коммита допустимо после подтверждения одинаковых значимых
входов проверки; одной замены OID недостаточно. Матрица фиксирует применимость
результатов, не требует полного повторного прогона для каждого предка. Модель
не выбирает проверки и не выполняет их.
Обработчик сравнивает весь граф, не меняет индекс и не делает fetch.
`refs/replace`, grafts и shallow-история блокируют push: усечённый или подменённый
граф не позволяет достоверно проверить разрешённый набор.

Назначение и ревизию связывает с пользовательским запросом вызывающая среда.
Это не альтернативный источник подключения: перед сетью обработчик повторно
читает актуальную интеграцию и требует совпадения. Модель получает только
`{"action":"push"}` и единственный инструмент `git_push` без аргументов.

Перед отправкой фиксируется журнал. Удалённый хеш проверяется через `ls-remote`
и повторно по данным фактического обмена в `pre-push` guard; настроенный hook
вызывается с исходным вводом. Используется явная ветка, без force, тегов и
отправки submodules. После push удалённая ветка читается снова.

`pushStatus: succeeded` означает подтверждённый `remoteCommit`; уже достигнутое
назначение возвращает `noop`. После сетевого сбоя результат — `partial`/`unknown`.
Повтор с тем же контекстом и requestId только подтверждает ранее достигнутый
хеш либо блокирует запись до разбора состояния. Замена requestId не является
разрешением повторить неизвестную операцию.

После разбора сбоя и разрешения пользователя вызывающая среда может добавить
`recovery: { "attempt": N }` в исходный контекст. `N` — следующий номер после
`result.recoveryAttempts` (для старого журнала — `1`), максимум `16`. Это разрешает
одну отправку той же операции: requestId, назначение, ревизия, коммиты и проверки
сохраняются. Нужен существующий журнал `sending`/`unknown` и фактический remoteOid,
совпадающий с исходным. Достигнутый sourceOid возвращает `noop`.
Номер расходуется в журнале до push; повтор использованного номера не отправляет
изменения снова. Модель не назначает recovery; журналы вручную не сбрасываются.

При ошибке push `diagnostic` содержит только `stage`, конечную `category` и
`exitCode`. Классификатор читает не более 64 KiB stderr в памяти; сообщения,
URL и секреты не передаются в результат или журнал. Категория `unknown` означает,
что причины не хватает для классификации. Диагностика сбоя отправки сохраняется
в журнале и доступна при последующей сверке; у старых попыток её может не быть.

## Подключение HTTPS/SSH

[GitRepositoryConnectionService](../../../packages/payload-ai-plugin/src/integrations/runtime/GitRepositoryConnection.service.ts)
использует существующий реестр и vault. Настройки хранятся в JSONB интеграции
`github:primary`: `transport` и, для SSH, `sshProfileRef`. Старая запись без
transport означает HTTPS. Изменение доступно через существующий API настроек;
переключатель транспорта в Admin UI этим этапом не добавлен. REST-проверка
GitHub не подтверждает SSH-доступ.

Исполнитель читает `DATABASE_URI` (либо `DATABASE_URL`) и
`REALIZE_INTEGRATIONS_ENCRYPTION_KEY` из среды, затем `.env.local` и `.env`
без переопределения уже заданных значений. SQL и расшифровка остаются у общего
серверного владельца. Inspect и commit с явной `identity` не обращаются к БД;
commit без неё читает только настроенного автора до запуска модели.

GitHub-токен хранится в `credential_envelope` записи `github:primary` таблицы
`realize_ai_integrations` и расшифровывается общим vault (AES-256-GCM).
`REALIZE_INTEGRATIONS_ENCRYPTION_KEY` — ключ шифрования хранилища,
`REALIZE_GIT_CODEX_HOME` — отдельный профиль авторизации Codex CLI для модели.
Они не являются GitHub-токеном и не задают права репозитория. Для GitHub REST
используется API credential общего resolver; SSH identity разрешает Git transport.
Права выдаёт GitHub конкретному credential. Подтверждение repository permission
не доказывает доступ ко всем административным endpoints или настройкам.

HTTPS использует токен только в окружении дочернего процесса и временный
`GIT_ASKPASS`. Токен не попадает в URL, Git config, аргументы модели или отчёт.
Для SSH назначь `REALIZE_GIT_SSH_PROFILES_FILE`: абсолютный путь к личному JSON
с правами `0600`. Ключи объекта — ссылки на профили из БД, значения:

```json
{
  "primary": {
    "knownHostsFile": "/absolute/known_hosts",
    "identityFile": "/absolute/deploy_key"
  }
}
```

В режиме ключа `identityFile` указывает закрытый ключ. Для `ssh-agent` задай
также `agentSocket`; `identityFile` указывает открытый ключ, ограничивающий
выбор identity. Файлы, socket и доверенные host keys настраивает владелец среды.
Профиль не содержит текста ключа. SSH запускается без интерактива, унаследованного
агента и пользовательского SSH config, со строгой проверкой сервера.

Текущий поставщик — GitHub, URL строится из проверенного slug. Автоматическая
смена транспорта или credentials, URL rewriting и обход TLS/host keys запрещены.
HTTPS останавливается при обнаружении `.netrc`/`_netrc` или конфликтующих настроек
HTTP/credentials, чтобы Git не подставил другое подключение. Временные файлы
авторизации удаляются при закрытии сетевой операции. Настроенные hooks commit/push
сохраняют свои полномочия и требуют доверенной рабочей среды. Переключение ветки
в manage и fast-forward pull выполняются с отключёнными hooks и рекурсией
submodules; они не запускают попутные команды локального checkout.

## Прямой локальный вход

Требуются Linux с `/proc`, `flock`, Git с поддержкой `--pathspec-from-file`
и Node.js версии из [корневого README](../../../README.md). Сам обработчик
не имеет внешних npm-зависимостей; воркер использует зависимости проекта.
Для доверенного механизма запуска интерфейс выглядит так:

```sh
REALIZE_GIT_CONTEXT_FILE=/absolute/context.json node .ai/tools/git-delivery/src/runGitDelivery.controller.ts < command.json
```

В `stdin` передаётся только команда:

```json
{ "action": "commit", "message": "docs: уточнить порядок работы" }
```

Механизм запуска отдельно разрешает ссылки на авторство и проверки из ADR
в контекст версии `1`. Его локальный формат определён в
[contracts.ts](src/contracts.ts):

| Поле                               | Значение                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                          | `1`                                                                                                                                                     |
| `requestId`, `projectId`, `taskId` | Идентификаторы операции, проекта и рабочего контекста; `taskId` не требует TASK                                                                         |
| `repositoryRoot`                   | Абсолютный корень рабочей копии                                                                                                                         |
| `authorization.actions`            | Разрешённые действия                                                                                                                                    |
| `authorization.scope`              | `{ "mode": "all" }`, явно разрешённый полный снимок `{ "mode": "all", "includePartialIndex": true }` либо `{ "mode": "paths", "paths": ["README.md"] }` |
| `identity`                         | Разрешённые `name` и `email` автора и коммитера; нужны для commit                                                                                       |
| `verification.inputPaths`          | Точные пути значимых конфигураций, зависимостей и других входов проверок                                                                                |
| `verification.requiredChecks`      | Идентификаторы проверок, выбранных по изменению                                                                                                         |
| `verification.results`             | Результаты `{ "id", "status", "fingerprint" }`                                                                                                          |

Файл контекста принадлежит текущему пользователю, недоступен группе и остальным
пользователям, является обычным файлом и занимает не больше 1 MiB. Эти проверки
защищают от случайного раскрытия; они не изолируют программы одного пользователя.
Доверие к разрешению на запись и факту выполнения проверок обеспечивает
вызывающая среда, а не права файла или текст Git-воркера.

Для `inspect` авторство и результаты проверок не нужны. Снимок связывает HEAD,
ветку, байты индекса, разрешённые изменённые файлы и `inputPaths`. Проверяющий
исполнитель должен выполнить нужные проверки между двумя одинаковыми снимками
и привязать успешные результаты к полученному `fingerprint`. Перед commit
обработчик повторно сверяет этот снимок. Он не запускает тесты по произвольной
команде и не назначает универсальный набор проверок; отсутствие действительных
результатов возвращает конкретный блокер.

Сообщение commit составляет воркер, если основной агент его не передал.
Сама программа не вызывает модель: без текста возвращает `message_required`.
Неизвестные поля, Git-флаги и секреты не входят в контракт команды.

## Поведение и ограничения

- `inspect` читает состояние без staging, записи журнала или обновления индекса.
  Поля путей возвращаются как данные; сводка ограничена 200 записями и 32 KiB.
- Commit выполняется в существующей локальной ветке, вне merge, rebase и других
  незавершённых Git-операций. Пути точные, относительно корня: без каталогов,
  glob-подстановок, обхода родительских каталогов и вложенных submodule.
- Чужой staged-состав и частично подготовленный файл блокируют обычный commit.
  Явное полное разрешение `all + includePartialIndex: true` включает текущую
  рабочую версию каждого разрешённого файла без очистки или сброса индекса.
  Оно входит в binding операции; добавить флаг к прежнему журналу нельзя.
  Разрешённое восстановление проверяет принадлежность индекса по описанному выше контракту.
  Разрешённые файлы передаются в `git add` через NUL-разделённый список.
  Содержимое и режим staged-объектов сверяются с проверенным снимком; фильтры,
  меняющие байты при staging, в этом этапе требуют отдельной обработки.
- Hooks и подпись сохраняются. После commit сверяются дерево, единственный
  родитель, авторство и сообщение. Отказ или изменение результата hook не
  скрываются; автоматические reset, stash и исправления не выполняются.
- Явные секреты и локальные артефакты блокируются. Детектор содержимого
  дополнительный: он не заменяет проверку состава и не гарантирует отсутствия
  всех возможных секретов.
- Общая блокировка координирует обработчики связанных worktree. Пользователь
  может редактировать файлы; повторное сравнение обнаруживает изменения,
  но не является изоляцией от произвольных внешних процессов и hooks.
- Git запускается без shell, с ограниченным окружением, временем 30 секунд,
  вводом до 1 MiB и stdout/stderr до 4 MiB каждый. Предел одного файла снимка
  32 MiB, общего содержимого 128 MiB; чтение staged blob также подчиняется
  пределу вывода Git. Имена файлов должны быть в UTF-8. При превышении лимита
  возвращается ошибка, данные не обрезаются молча.

Локальный обработчик inspect/commit не вызывает БД, fetch или push. Настроенные пользователем Git hooks
и фильтры исполняются самим Git и сохраняют свои полномочия.

## Результат и продолжение

CLI печатает один JSON версии `1`: статус, ветку, commit, сводку изменений,
отпечаток, использованные проверки и безопасный код ошибки. Содержимое файлов,
сырой stderr и секреты не печатаются. Коды выхода: `0` — `succeeded`/`noop`,
`2` — `blocked`, `1` — `partial`/`failed`.
Если после попытки commit недоступен даже HEAD, `commit` и `commitCreated`
равны `null`, а `errorCode` — `commit_state_unknown`.

До изменения индекса сохраняется журнал:
`.ai-workspace/tasks/<taskId>/logs/git-delivery/<requestId>.json`.
Этот путь должен быть исключён из Git заранее. Запись файла и каталога
синхронизируется на диск; перед commit сохраняется подготовленное дерево.
Журнал содержит хеши и сведения о составе, а не содержимое файлов.
Commit без изменений также сохраняет результат: повтор завершённой операции
не должен включать появившиеся позже файлы.

Повтор использует тот же `requestId`, команду и разрешение. Существующий commit
проверяется по исходному HEAD, дереву, сообщению и авторству; новые правки
не включаются. При `noop` поле `commitCreated: true` означает commit, созданный
этой же операцией при предыдущей попытке. Неоднозначное состояние блокирует
запись. Утрата журнала требует разбора состояния, а не замены `requestId`.
Учёт уже выданных идентификаторов при утрате журнала относится к будущему
механизму запуска; локальный файл сам по себе не отличает утрату от первого вызова.
После ошибки staging может остаться подготовленным; `partial` сообщает
о возможном побочном эффекте без автоматического отката.

## Устройство и проверка

`src/worker/` содержит вход CLI, загрузку настроек, координацию сессии и
ограниченные вызовы выбранного действия. Общий JSONL-транспорт принадлежит
`packages/codex-adapter/src/JsonLineRpcClient.adapter.ts`; его прежний
потребитель `OpenAICodexAdapter` сохраняет свой API.

| Файл                                                                                                                                           | Ответственность                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [runGitDelivery.controller.ts](src/runGitDelivery.controller.ts), [contracts.ts](src/contracts.ts)                                             | Разделение входов, валидация, JSON-ответ                                      |
| [handler.ts](src/handler.ts)                                                                                                                   | Порядок операции и восстановление                                             |
| [repository.ts](src/repository.ts)                                                                                                             | Ограниченный снимок состояния и файлов                                        |
| [Git.adapter.ts](src/Git.adapter.ts)                                                                                                           | Исполнитель Git, пределы, байты и UTF-8                                       |
| [safety.ts](src/safety.ts), [commit/](src/commit/)                                                                                             | Совместимые экспорты, проверки и восстановление локального commit             |
| [manage/](src/manage/)                                                                                                                         | Контекст, локальное управление remote/worktrees/ветками и безопасное чтение   |
| [sync/](src/sync/)                                                                                                                             | Закреплённые fetch/pull, fast-forward и восстановление этапов                 |
| [merge/](src/merge/)                                                                                                                           | GitHub approved-tree commit, точная область дерева и подтверждение target ref |
| [state.ts](src/state.ts), [GitJournal.repository.ts](src/GitJournal.repository.ts), [acquireGitLock.adapter.ts](src/acquireGitLock.adapter.ts) | Журнал и отдельная блокировка                                                 |

Старые публичные входы `contracts.ts`, `safety.ts`, `state.ts` и `repository.ts`
сохраняют совместимость; типы, ошибка, блокировка и проверки commit имеют
отдельных владельцев.

Сетевую операцию координирует `src/push/`, авторизацию и Git-протокол —
`src/network/`. Общие ресурсы БД находятся в `src/integrations/`; их используют
push, fetch, pull, merge и загрузчик автора для commit без явной `identity`.

Проверки запускаются из корня проекта:

```sh
node --import tsx --test .ai/tools/git-delivery/test/*.test.ts
node_modules/.bin/tsc -p .ai/tools/git-delivery/tsconfig.json
```

Тесты создают и удаляют собственные временные репозитории. Они не выполняют
Git-операции в рабочей копии проекта. Сетевые фикстуры используют loopback HTTPS;
SSH проверяется подменным исполнителем без внешнего сервера. Общая сборка CMS
и браузерная проверка для этого инструмента не требуются.

Семантика используемых механизмов: [NUL-вход git add](https://git-scm.com/docs/git-add),
[porcelain git status](https://git-scm.com/docs/git-status),
[flock](https://man7.org/linux/man-pages/man1/flock.1.html).

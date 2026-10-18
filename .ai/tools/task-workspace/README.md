# Локальное досье задачи (`task-workspace`)

CLI управляет versioned локальным досье в `.ai-workspace` до отдельного
cutover к Task API. Каноническое поведение рабочего агента принадлежит
[правилу](../../rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md), порядок
сдачи — [main-delivery](../../workflows/core/main-delivery/WORKFLOW.md), вход
создания — [шаблону TASK](../../templates/task-workspace/TEMPLATE-TASK.md).
Публичные schemas принадлежат
`@realize/payload-task-manager/workspace-contracts`.

Инструмент не меняет server Foundation, не синхронизирует Task API и не
запускает, не ставит в очередь и не возобновляет агентов. Production services,
`.next`, корневой `node_modules`, пользовательские данные и runtime stores
других инструментов не входят в область task cleanup.

## Вход и пути

Запуск из корня проекта:

```bash
npm run task:workspace -- inspect --task <localKey>
```

`localKey` — стабильный ключ из строчных латинских букв, цифр и дефисов,
до 128 символов. CLI различает `.ai-workspace/tasks/<localKey>/` и
`.ai-workspace/history/<localKey>/`; одновременное существование двух досье
с одним ключом — conflict. UUID `localDossierId` сохраняется при переносах.

Файловые `--input`, `--body-file` и `--plan` задают project-relative либо абсолютный
путь JSON/Markdown внутри проекта; выход за корень отклоняется. Artifact paths в
JSON и `--output` для плана задаются только относительно досье. Они не могут
быть абсолютными, содержать traversal или symlink ancestors.

Мутации versioned досье требуют актуальный `--expected-revision`; `create` и
явный legacy `adopt` задают первую revision без этого flag.
При conflict перечитай `inspect`. Если есть pending, продолжи исходную операцию
через `recover`; новая ревизия не снимает блокировку. Без pending разреши
расхождение и передай свежую ревизию.
`cleanup` берёт task/manifest revisions и body hash из точного reviewed плана.

`--input -` читает один JSON из stdin за один проход с пределом 1 MiB включительно.
Для разового входа используй stdin: отдельный файл с аргументами и дерево для
его удержания не нужны. Файловый ввод, декодирование UTF-8 и проверки схем
сохраняются; превышение размера, два JSON или повторный `--input` отклоняются.
Например, после задания `TASK_KEY` и актуальной `TASK_REVISION`:

```bash
npm run --silent task:workspace -- status \
  --task "$TASK_KEY" --expected-revision "$TASK_REVISION" --input - --compact <<'JSON'
{"category":"active"}
JSON
```

Отдельный boolean-флаг `--compact` выбирает ответ в одну строку JSON. По умолчанию
возвращается полный ответ; справка остаётся полной и с `--compact`. `--output`
по-прежнему задаёт путь плана очистки. Для машинного чтения stdout используй
`npm run --silent`; ошибки выводятся в stderr с ненулевым exit code.

Краткий ответ сохраняет `action`, `key`, известную `revision`, `outcome`,
`error/message/reason`, указатель `result` и ссылки `operation/recovery`.
`status: completed` означает успешное выполнение команды, а не закрытие или
приёмку задачи. У частичного `inspect` сохраняются диагностика и pending refs.
Неизвестные данные равны `null`; форматирование не читает досье повторно.
`revision` берётся из возвращённого TASK либо плана у `plan-cleanup`;
для cleanup/receipt без TASK она неизвестна, а исходная ревизия плана доступна
в `plan.taskRevision`. Ошибка не выдаёт expected revision за актуальное состояние.

`inspect --compact` сохраняет artifact IDs/revisions/hashes/paths/state,
`plan` — requestId/file/hash/paths/taskRevision, восстановление producer —
artifactIds/paths/settlement/phase и сведения cleanup/receipt. Полный контракт —
[`WorkspaceCompactResponse`](src/cli/WorkspaceCommand.types.ts).

## Структура инструмента

| Каталог               | Ответственность                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `src/cli/`            | Разбор аргументов и вызов выбранной команды                                               |
| `src/dossier/`        | Чтение TASK, создание, переходы, перенос и чистые lifecycle-проверки                      |
| `src/artifacts/`      | Подготовка, регистрация и завершение артефактов; чтение evidence и публикация результата  |
| `src/producer-group/` | Публичный вход группы, process-local привязки, инварианты и собственные каталоги producer |
| `src/cleanup/`        | План, общие проверки допустимости и применение очистки                                    |
| `src/recovery/`       | Общий вход мутации, журнал, индекс прежних операций и точная запись metadata              |
| `src/filesystem/`     | Закреплённый файловый доступ, пути, блокировка, снимок, удаление и хеширование            |
| `src/consumers/`      | Область поиска, сопоставление ссылок и чтение доступных процессов                         |
| `test/`               | CLI, lifecycle/safety и producer-group сценарии на временных хранилищах                   |

Общие пути задаёт `src/workspacePaths.config.mjs`; CLI
`src/cli/runWorkspaceCommand.controller.mjs` вычисляет корень относительно
расположения инструмента, поэтому прямой запуск не зависит от текущего cwd.
`Workspace.error.mjs` хранит общий контракт безопасных ошибок. Чистые валидаторы
не выполняют файловых операций; чтение результата и проверка producers находятся
в `artifacts/verifyWorkspaceEvidence.service.mjs`.
`artifacts/withWorkspaceEvidencePhase.service.mjs` владеет снимками одной
синхронной фазы проверки. В этой фазе несколько checks и refs одного дерева
используют общую сводку hash/bytes; metadata артефакта и принадлежность evidence
проверяются при каждом обращении. Контекст закрывается при выходе или ошибке,
не переносится в другое хранилище/досье и не переживает запись. Следующий вызов
и разрушительные фазы очистки проверяют физическое состояние заново.

## Команды

| Команда        | Вход и эффект                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `create`       | `--task`, `--title`, optional `--body-file`; новое open-досье и пустой artifact manifest                              |
| `adopt`        | `--task`, `--title`, явно выбранная `--category open\|active`; body legacy TASK сохраняется                           |
| `inspect`      | `--task`; чтение досье и artifact metadata, без изменения состояния                                                   |
| `status`       | `--task --expected-revision --input`; переход category и отдельные execution/acceptance/delivery projections          |
| `register`     | Те же flags; регистрация явно перечисленных artifact trees по текущим hashes/bytes                                    |
| `settle`       | Те же flags; завершение выбранных producers после проверки записанной PID identity                                    |
| `result`       | Те же flags; durable immutable result manifest в `logs/results/<revision>.json`                                       |
| `plan-cleanup` | `--task --expected-revision`, optional `--input {paths}`, optional `--output logs/<file>.json`; точный план без purge |
| `cleanup`      | `--plan <project-path>` показывает сохранённый план; `--apply` применяет и восстанавливает тот же reviewed план       |
| `archive`      | `--task --expected-revision`; атомарный перенос closed/quiescent досье в `history/`                                   |
| `recover`      | `--task --operation`; продолжение исходной сохранённой операции без нового входа и плана                              |
| `reopen`       | `--task --expected-revision`; возврат closed-досье в active с сохранением identity/истории                            |

Для `create` и `adopt` повторяемый `--required-check <id>` задаёт обязательные
checks. `--acceptance-required` и `--delivery-required` включают соответствующие
gates по критериям задачи. Политика обязательности не подменяется поздним
`status`; отмена оформляется отдельным outcome и причиной.

Начальная пара TASK/manifest создаётся только через `create` или явный `adopt`.
Заголовки нового TASK соответствуют действующему шаблону. У managed-досье manifest
обязателен: отсутствие (`artifact_manifest_missing`), повреждение или чужой
`localDossierId` блокируют зависимую операцию. Повтор create/adopt не затирает
частичную инициализацию после физического сбоя: `inspect` возвращает ссылку
операции, а `recover` продолжает сохранённые before/after. Чужая правка блокирует
восстановление и требует разбора.

Frontmatter `TASK.md` содержит `schemaVersion: 1`, identity/revision/даты,
`status: {id, category}`, отдельные execution, acceptance, delivery и outcome,
result pointer, optional server `taskRef`, legacy metadata и `archivedAt`.
`taskRef` зарезервирован для отдельного cutover; текущие команды не привязывают
локальное досье к серверной задаче.
`criteriaHash` фиксирует body целиком. Его изменение требует нового result
и требуемой приёмки; closed или archived досье сначала переоткрывается.

## Регистрация и producers

Пример входа `register`; файл должен описывать реальные завершённые материалы:

```json
{
  "artifacts": [
    {
      "path": "tmp/build-cache",
      "category": "temporary",
      "producer": { "id": "build-cache", "pid": null, "settled": true },
      "retention": {
        "mode": "temporary",
        "pinned": false,
        "keepReason": null,
        "referencedBy": []
      }
    }
  ]
}
```

Category задаёт допустимый префикс: `reference` → `references/`, `screenshot`
→ `screenshots/`, `snapshot` → `snapshots/`, `log` → `logs/`, `draft` →
`drafts/`, `result` → `logs/results/`, `temporary` → `tmp/`. Только temporary
category допускает retention `temporary`; остальные удерживаются через
`retain`. IDs, revisions, actual bytes и hashes задаёт tool. Повторная
регистрация ready path и перекрывающиеся ready trees отклоняются.

Служебные result, cleanup plan и receipt не могут совпадать с registered ready
path, находиться внутри него или заменять его предка. Guard действует в прямых
сервисах и CLI, для очистки — до записи плана и перед разрушительными фазами.
Проверяется точный выходной файл: зарегистрированная соседняя квитанция допустима.
`settled: false` не разрешает обычной служебной операции писать в чужой producer.
Владелец группы пишет только свои выделенные outputs после `begin` и до `settle`;
это отдельный producer-контракт. Browser fixture регистрирует собственный каталог
квитанции до основной группы и запуска ресурсов; перед записью повторно проверяет
владение и открытое состояние именно этой группы.

Работающий producer указывается с `settled: false`, его настоящим PID и
стабильным ID. Tool записывает identity (`bootId`, `startTicks`) сам; номер PID
не считается достаточным свидетельством. Stage/attempt refs optional и не
выдают право запуска. `settle` принимает `{ "artifactIds": ["<UUID>"] }`;
живой процесс с записанной identity блокирует завершение producer. Для процесса
без зарегистрированного PID владелец этапа подтверждает прекращение записи
фактически, затем вызывает `settle`.
`settle` фиксирует итоговые bytes/hash и повышает artifact revision; для сдачи
результата используй актуальные refs из следующего `inspect`.

Обычная сдача отчёта и доказательств без конфликта использует два дерева по
назначению и три мутации: register → один settle → result. Между ними `inspect`
даёт IDs и актуальные refs: всего пять команд. Вход каждого изменения можно
передать через stdin; отдельное дерево входных JSON не требуется. Создание
досье, принятие результата, закрытие, конфликты и recovery имеют собственные
действия и не подгоняются под этот бюджет сдачи.

Приватные `.env`, key/PEM, SQLite и dump paths не регистрируются как task output.
Корень artifact tree не может быть symlink. Конечные ссылки внутри дерева
хэшируются как текст `readlink`; их targets не открываются и не удаляются.

### Группа одного producer этапа

Для подключённых scripts owner экспортирует
`beginWorkspaceProducerGroup(storage, localKey, { stageId, attemptId, artifacts })`
и `finalizeWorkspaceProducerGroup(storage, group, { quiescent, cleanupTemporary })`
из `src/producer-group/workspaceProducerGroup.index.mjs`. `attemptId`, если указан, — UUID.
Begin требует существующее managed досье, создаёт новые пустые artifact trees
без overwrite и регистрирует их как unsettled. Finalize принимает тот же
оригинальный handle в том же процессе: JSON-копия не подтверждает владение.
Привязка проверяет identity досье и собственные artifact-записи; изменения другой
группы не инвалидируют handle. Каждая мутация читает актуальные ревизии под lock.
После settle привязка обновляется только по сверенным сохранённым данным своей
операции; чужая правка собственных артефактов не принимается за такой переход.

У группы `pid: null`: она представляет запись, которой управляет caller,
а не притворяется завершившимся процессом script. Caller сначала подтверждает
остановку своих children и flush streams, затем передаёт `quiescent: true`.
`false` сохраняет unsettled outputs. Finalize выполняет штатный settle,
сверяет metadata и может применить cleanup только exact temporary paths группы
с существующими retention, reference, hash и execution guards. Unknown outcome
и частичные I/O ошибки требуют сверки владельцем; они не означают успешную очистку.

Результат имеет явные варианты `completed` и `blocked`. Завершённая очистка
требует `receipt` с `requestId`, `status`, `paths`, `estimatedAllocatedBytes`
и `completedAt`. Blocked содержит `reason`, состояние `settlement`, достигнутую
`phase` и `operation` со ссылкой восстановления либо `null`; неподтверждённое
состояние обозначается `unknown`. При частичном выполнении повтор сначала
сверяет исходную операцию, а затем привязку; новый план не подставляется.

Fixture сначала регистрирует retained+pinned каталог
`logs/task-browser-<runId>-lifecycle/`, затем logs/screenshots/tmp основной группы.
Ресурсы запускаются только после обеих регистраций. После завершения основной
группы fixture пишет `receipt.json` в собственный открытый каталог и отдельно
завершает группу квитанции без очистки temporary. Лимит 1024 общий: при 1021
существующей записи основная группа отклоняется до ресурсов, а место квитанции
уже сохранено; при 1020 помещаются все четыре новых артефакта.

Файл квитанции фиксирует состояние до её отдельного settle и затем не переписывается.
Возвращаемый результат fixture различает `completed`, `open`, `unwritten` и
`unknown`, отдельно сообщает `writeState`, quiescence writers, settlement и
ссылку операции. Итоговый settle подтверждается этим результатом и manifest.

Отказ основной группы без pending допускает запись и завершение только квитанции,
если её собственные writers остановлены. Это не меняет blocked основной группы.
При pending разрешены только диагностические байты внутри заранее
зарегистрированного собственного открытого дерева: TASK/manifest и register/settle
не меняются до recovery. Квитанция остаётся retained+pinned+unsettled.
Если quiescence её writers не подтверждена, запись и завершение откладываются.
Единственный назначенный writer квитанции — синхронный координатор; её путь не
передаётся дочерним ресурсам. Найденные process references на её каталог блокируют
запись. `writerCoverage` сохраняет число ссылок, недоступных записей и область
проверки: недоступный посторонний `/proc` сам по себе не доказывает writer этой
квитанции. Это подтверждение собственных writers с ограниченным поиском внешних
ссылок, а не доказательство отсутствия всех процессов на машине.
После потери процесса handle не восстанавливается из JSON: сначала recovery,
затем явный `settle` проверенных artifact IDs.

Первый consumer — Task Manager browser fixture; её logs/screenshots/result
остаются в назначенном досье, а собственный Next tmp убирается после quiescence.
Группа не меняет status/result/archive родительской задачи. Другие scripts
подключаются отдельно, автоматического interceptor нет.

## Результат и gates

Вход `result` содержит `summary`, `artifacts: [{id, revision, hash}]` и
`checks: [{id, status, evidence}]`. Остальные служебные поля, timestamp,
criteria hash и очередную result revision заполняет tool. Checks имеют
`passed|failed|not_required`; evidence задаётся обычным файлом в `logs/`.
Этот файл либо содержащий его tree должен быть зарегистрирован как retained
artifact и включён точной revision/hash в `result.artifacts`. Symlink evidence
не подходит. Tool повторно сверяет физические hashes/bytes и producer quiescence.
Статус `passed` описывает действительно выполненную проверку: CLI не запускает
её и не превращает наличие файла в подтверждение успешного выполнения.

Result references могут указывать только на ready retained artifacts.
Их revisions/hashes фиксируются, а `referencedBy` удерживает результат от
очистки. Повторная сдача создаёт новую immutable revision и сбрасывает текущую
приёмку. `done` требует актуального результата и `passed` для всех
`requiredChecks`. Успешное `closed` дополнительно требует quiescence,
обязательных acceptance/delivery и совпадения принятых result/criteria hashes.
Completed delivery требует непустое retained evidence в `logs/`; его файлы
также должны принадлежать registered artifacts.

`status` использует JSON, например `{ "category": "active" }`. Execution —
наблюдаемая проекция; `running` требует runtime ref, а команда не запускает
процесс. Отмена: `{ "category": "closed", "outcome": "cancelled",
"cancellationReason": "<Причина>" }`; cancelled не означает accepted.
`cancellationReason` без `outcome: "cancelled"` отклоняется до записи. Причина
включается в окончательное body до проверки hash и gates; лимит 512 KiB также
применяется к окончательному UTF-8 тексту.

## План очистки и восстановление

`plan-cleanup` выбирает ready temporary artifacts; `--input` может сузить выбор
до `{ "paths": ["tmp/build-cache"] }`. Plan сохраняется в `logs/cleanup-plans/`
либо в выбранный `--output logs/<file>.json`; его project path возвращается
в ответе. Сохрани evidence и проверь exact список до `cleanup --plan … --apply`.

Active execution, unsettled/live producer, retain/pinned/keepReason/referencedBy,
source/process references, changed hashes/bytes/revisions и пересекающиеся
trees блокируют purge. Проверки повторяются перед переносом. План фиксирует
filesystem snapshot и coverage; allocation estimate не равняется reclaimed
bytes при hardlinks.

Каждая мутация, включая create/adopt и запись плана, входит в общий контекст.
Порядок блокировок — recovery-index → задача; общая блокировка освобождается
после подготовки индекса и захвата задачи. Вложенные фазы используют один
контекст, без второго журнала. До первого эффекта устойчиво записывается
`runtime/operations/<key>/pending.json`: identity, вход, исходные и конечные
файлы, порядок и курсор фаз. Записи файлов и каталогов синхронизируются через fsync.
Metadata допускают только достижимый префикс записей; произвольная смесь TASK
и manifest, чужое body или identity не разрешают дозапись.

Temporary tree переносится в quarantine без overwrite. Перед rename и purge
снова проверяются retention, consumers и снимок. Только сохранённая фаза
purging допускает сверенный остаток после частичного удаления; новый файл
или изменённая identity блокируют продолжение. Итог — `logs/cleanup-results/`.

При ошибке сохрани ссылку `operation` из ответа либо прочитай `inspect`:

```bash
npm run task:workspace -- recover --task <localKey> --operation <operationId>
```

Pending блокирует другие мутации, включая status, register и новый план.
Повтор продолжает исходные planPath/planHash/requestId; `recover` не принимает
новую revision, replacement state или обход CAS. Завершённая запись
`operations/<key>/completed/<operationId>.json` сохраняется до удаления pending.
Равный завершённый запрос возвращает прежний результат без повторения эффектов;
тот же ID с другим входом отклоняется. `inspect` раскрывает только ссылки и фазу,
без закрытого содержимого журналов.

Прежние плоские журналы остаются на месте. Первый вход строит ограниченный
индекс с устойчивыми building/cursor/ready; до ready мутация не начинается.
Обычный вход читает маркер, собственный pending и legacy-связи своего ключа,
не сканируя чужие журналы. Повреждение, неизвестная версия и конфликтующие
операции блокируют запись. Если старый cleanup не хранит planPath, ошибка
`original_plan_required` требует `cleanup --plan <original> --apply`: индекс
связывает только проверенный исходный requestId/hash/ключ/UUID. Поиск или
создание другого плана не заменяют восстановление.

Новый протокол нельзя включать одновременно со старыми writers. Сначала
проверяют переход на изолированном хранилище и останавливают старых writers.
После первой новой записи простой откат CLI небезопасен: сначала требуется
завершить pending совместимой версией. Обратная миграция не реализована.

Archive/reopen также используют recovery journal и перенос без overwrite.
Archive проверяет quiescence всех ready producers, включая cancelled-досье;
полные path references в собственном TASK и других досье удерживают consumers.
Собственные Markdown-ссылки проверяются относительно назначения переноса:
переносимые `logs/...` разрешены, ссылки, остающиеся в старом каталоге, блокируют move.
Archive не означает acceptance и не выполняется автоматически при закрытии;
reopen сохраняет прежние result manifests, сбрасывает текущую приёмку/delivery и
не запускает runtime. Предыдущие metadata/решения остаются в приватном local
recovery journal инструмента; это не серверный acceptance audit API.
Native runtime stores не копируются в досье.

## Границы проверки

Filesystem adapter требует Linux `/proc`, kernel `flock` и GNU `mv` с
`--no-copy --update=none-fail`. Parents закрепляются FD; symlink ancestors
и root links отвергаются. Snapshot ограничен 50 000 entries, 256 MiB на файл
и 2 GiB содержимого на tree. Body ограничен 512 KiB.

Source scan ограничен активным code/config/doc scope, включая `tests/`.
Поддерживаются буквальные пути (в том числе `./` от корня, абсолютные и `file:`)
и Markdown-формы TASK; точный путь и потомки различаются с соседним именем
`cache-v2`. Это лексический поиск, а не анализ вычисляемых путей.
Пределы — 15 000 просмотренных записей, 2048 соседних досье и 2 MiB на поддержанный
файл. Превышение даёт `reference_scan_limit`, а не пустой список потребителей.
Process refs проверяются
по доступным same-UID `cwd/exe/fd/pathname argv`, без чтения environment и вывода
argv. Privileged processes, future dynamic reads и внешние service launchers
не доказываются отсутствующими: перед destructive действием их сверяет owner.
Runtime locks/journals игнорируются Git и остаются у инструмента.

## Проверки

`npm run check:task-workspace` последовательно выполняет проверку типов,
локальный ESLint, затем публичные contracts и lifecycle/safety на изолированных
`/tmp` fixtures, включая recovery и filesystem guards. Ошибка любой стадии
останавливает команду и обязательную цепочку CI.
Fixtures удаляют только собственные временные деревья; рабочие досье,
PostgreSQL и production services не используются.
`npm run check:task-fixture` проверяет process ownership/redaction и producer
цикл Task Manager fixture на isolated filesystem/process fixtures без рабочей БД.

Обе команды входят в `npm run ci`. Форматирование охватывает рекурсивно `.mjs`
и `.ts` в `src/` и `test/`, а также локальные настройки инструмента.
`npm run typecheck:task-workspace` включает strict checkJs/noEmit для всего этого
кода; `npm run lint:task-workspace` использует отдельный ESLint config, поскольку
корневая конфигурация исключает `.ai/`. Эти команды можно запускать адресно;
повторять их отдельно после успешного `check:task-workspace` на тех же входах
не требуется. `.github/workflows/ci.yml` достигает их через существующий
`npm run ci`, без второй дублирующей задачи.

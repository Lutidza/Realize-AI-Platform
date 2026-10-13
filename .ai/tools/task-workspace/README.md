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

`--input`, `--body-file` и `--plan` задают project-relative либо абсолютный путь
JSON/Markdown внутри проекта; выход за корень отклоняется. Artifact paths в
JSON и `--output` для плана задаются только относительно досье. Они не могут
быть абсолютными, содержать traversal или symlink ancestors.

Мутации versioned досье требуют актуальный `--expected-revision`; `create` и
явный legacy `adopt` задают первую revision без этого flag.
При conflict перечитай `inspect`, разреши расхождение и передай свежую ревизию.
`cleanup` берёт task/manifest revisions и body hash из точного reviewed плана.

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
| `reopen`       | `--task --expected-revision`; возврат closed-досье в active с сохранением identity/истории                            |

Для `create` и `adopt` повторяемый `--required-check <id>` задаёт обязательные
checks. `--acceptance-required` и `--delivery-required` включают соответствующие
gates по критериям задачи. Политика обязательности не подменяется поздним
`status`; отмена оформляется отдельным outcome и причиной.

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

Работающий producer указывается с `settled: false`, его настоящим PID и
стабильным ID. Tool записывает identity (`bootId`, `startTicks`) сам; номер PID
не считается достаточным свидетельством. Stage/attempt refs optional и не
выдают право запуска. `settle` принимает `{ "artifactIds": ["<UUID>"] }`;
живой процесс с записанной identity блокирует завершение producer. Для процесса
без зарегистрированного PID владелец этапа подтверждает прекращение записи
фактически, затем вызывает `settle`.
`settle` фиксирует итоговые bytes/hash и повышает artifact revision; для сдачи
результата используй актуальные refs из следующего `inspect`.

Приватные `.env`, key/PEM, SQLite и dump paths не регистрируются как task output.
Корень artifact tree не может быть symlink. Конечные ссылки внутри дерева
хэшируются как текст `readlink`; их targets не открываются и не удаляются.

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

Перед purge сохраняется recovery journal в `.ai/tools/task-workspace/runtime/`.
Temporary tree переносится в закреплённую quarantine без overwrite; удаляется
только сверенное дерево. Повтор того же плана продолжает известные journal
phases; completed plan возвращает свой receipt. Unknown outcome или divergence
не считаются успехом. Итог сохраняется в `logs/cleanup-results/`.

Archive/reopen также используют recovery journal и перенос без overwrite.
Archive проверяет quiescence всех ready producers, включая cancelled-досье;
полные path references в собственном TASK и других досье удерживают consumers.
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

Source scan ограничен активным code/config/doc scope. Process refs проверяются
по доступным same-UID `cwd/exe/fd/pathname argv`, без чтения environment и вывода
argv. Privileged processes, future dynamic reads и внешние service launchers
не доказываются отсутствующими: перед destructive действием их сверяет owner.
Runtime locks/journals игнорируются Git и остаются у инструмента.

## Проверки

`npm run check:task-workspace` проверяет публичные contracts и lifecycle/safety
на изолированных `/tmp` fixtures, включая recovery и filesystem guards.
Fixtures удаляют только собственные временные деревья; рабочие досье,
PostgreSQL и production services не используются.

# Протокол инженерных операций

Версия: **1.10**, 2026-10-29. Статус: **accepted-as-target** с основанием
TASK-65 / ENG-07, программным созданием TASK-66 / ENG-08, exact-version
редактированием ENG-09 и частичным file move/quarantine ENG-10. Project move
`source.util`/`ai.template` синхронизирует metadata и поддержанные ссылки в одном
плане при явной complete host policy (§15.1). Bounded directory move реализован
и покрыт расширенной проверкой отказов и crash/recovery каталогов (§15.2).
Срез §15.2 принят пользователем 29 октября; оставшийся результат TASK-68,
включая case-only (§15.3) и переиспользование поиска, принят переходом к TASK-93.
Матрица ENG-11 и план первого расширения (§16) подготовлены для проверки;
программная реализация расширения ещё не начата.
Исходный протокол — TASK-64 / ENG-06. Основание ENG-07 сохранено в §12;
create baseline ENG-08 и последующие filesystem mutations описаны в §§13–15.
Новые endpoints, CLI/MCP/Admin capabilities и host activation ещё не подключены.

Архитектура и владельцы — [ADR-0019](decisions/ADR-0019-shared-engineering-operations.md),
типы/папки — [ENG-03](engineering-artifacts.md), задачи —
[ENG-04](../specifications/task-management-execution.md#15-целевой-контракт-задач-eng-04),
identity/scopes — [ENG-05](platform-access.md#единые-инженерные-полномочия-eng-05).
Здесь определён порядок исполнения, а не новая система задач или полномочий.

## 1. Владельцы и проверенные ограничения

`packages/engineering-runtime` получает FS, authorization, durable store,
generator, verification и clock/process ports; public DTO отделены от server API.
Project binding `.ai/tools/engineering` разрешает типы, inputs/outputs и recipes;
host control plane обеспечивает target, допуск и реальные process handles.
CLI и сервер используют один binding и namespace конкретного checkout.
MCP/Admin отображают DTO, не реализуют вторую файловую бизнес-логику.
Task/Git операции делегируются их владельцам, без raw shell/SQL/Git endpoint.

Фактическая отправная точка:

| Владелец                 | Что уже есть                                                            | Ограничение для нового протокола                                                                                |
| ------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Task Manager             | PostgreSQL mutation + receipt, CAS, повторная авторизация, replay hash. | Нет общей транзакции с FS; старые request hashes нельзя переписывать.                                           |
| Локальный task-workspace | Write-ahead journal, before/after и recovery по cursor.                 | Namespace досье, синхронный callback и живой lock context; не общий checkout lease.                             |
| Owner-host               | Durable run admission/finish, настоящий cancel/AbortSignal.             | Не per-file journal; crash не даёт автоматического resume или доказательства остановки descendants.             |
| Git runtime              | Linux flock для canonical git-common-dir; вложенный `existingLease`.    | Lease — process-local capability, не JSON grant; общая взаимная блокировка IDE/host ещё не внедрена.            |
| Verification runtime     | Строгий plan v1, checkpoints до/после, receipts, reuse, bounded spawn.  | Lock по project/task, не workspace; timeout команды не ограничивает весь hashing; нет durable process recovery. |

Эти ограничения не скрываются новым общим DTO. Adapter подключается только после
проверки соответствующих границ; неподдержанный write возвращает `UNSUPPORTED`.

## 2. DTO и команды

Предметный contract принадлежит engineering-runtime; protocol version **1**.
HTTP facade использует будущий `/api/engineering/v1`, MCP импортирует те же
validators/mappers. Это отдельная версия от `/api/access/v2` и Task Manager v2.
Старые DTO/HTTP routes/receipts не расширяются полями нового протокола.

Все входы — strict discriminated objects: неизвестные поля/actions отклоняются.
UUID IDs, UTC ISO dates, lowercase SHA-256, конечные числа, явный `null` для
неизвестного/отсутствующего значения; массивы и строки ограничены §10.
Пути — относительные POSIX paths без `..`, NUL, абсолютного префикса и пустых
segments; регистр и Unicode bytes сохраняются, скрытой нормализации имени нет.
После lexical validation проверяется descriptor-relative FS boundary.

| Команда           | Вход                                                                                              | Результат и эффекты                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepareContent`  | `{schemaVersion:1,targetId,requestId,mediaType,bytes,sha256}`                                     | Приватный immutable `contentRef`, размер/hash/expiry. UTF-8 либо разрешённый native media type; проверяется реальный hash. Это bounded storage write, не запись checkout. |
| `plan`            | `{schemaVersion:1,targetId,requestId,intent,taskRefs}`                                            | Durable `operationId`, `planId`, план или handle подготовки. Требует прав всех запрошенных эффектов. Generator preview также требует права выполнения.                    |
| `preview`         | `{schemaVersion:1,operationId,planId,after,limit}`                                                | Страница точных effects/diff с `planHash`, coverage и cursor. Не исполняет генератор заново и не меняет checkout.                                                         |
| `apply`           | `{schemaVersion:1,operationId,planId,planHash,requestId,expectedRevision}`                        | Принятие ровно frozen plan либо конфликт; результат/handle с тем же operation ID. Нет флага `force` или клиентского `authorized`.                                         |
| `get`             | `{schemaVersion:1,operationId}`                                                                   | Актуальные revision/state/effects/checks/bindings и безопасные refs. Чтение не запускает recovery.                                                                        |
| `cancel`          | `{schemaVersion:1,operationId,requestId,expectedRevision,reason}`                                 | Durable запрос отмены; `cancel_requested` не означает остановку/rollback.                                                                                                 |
| `inspectRecovery` | `{schemaVersion:1,operationId}`                                                                   | Read-only сверка journal/FS/process, `recoveryPlanId/hash`, версии и возможные действия; никакого автоматического retry.                                                  |
| `recover`         | `{schemaVersion:1,operationId,recoveryPlanId,recoveryPlanHash,requestId,expectedRevision,action}` | `resume`, `compensate` или `retain_partial` по новому точному допуску; тот же operation ID, следующий attempt.                                                            |
| `events`          | `{schemaVersion:1,targetId,after,limit}`                                                          | Страница событий либо subscription по тому же cursor; свежая авторизация, без скрытого запуска операции.                                                                  |

`taskRefs` — только ссылки на существующие задачи; обязательность привязки
определяет policy задания. Они не создают TASK/manifest или server task.
Клиентский `targetId` выбирает ранее разрешённый binding, не задаёт root/state path.
`requestId` — idempotency key конкретной команды; `operationId` выдаёт сервер.
Продолжение после timeout сохраняет прежние IDs и неизменное тело команды.

`intent` — один из двух вариантов: `file_batch` с конечным списком действий
или `generate` с recipe ID и типизированными параметрами. Внутри file batch:

| Kind               | Поля кроме `kind`                | Проверяемый смысл                                                                                               |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `create_file`      | `path,artifactKind,contentRef`   | Цель отсутствует; type/profile и родитель разрешены.                                                            |
| `edit_file`        | `path,expectedSha256,contentRef` | Полное замещение exact bytes версии; текстовый patch сначала материализуется и валидируется сервером.           |
| `create_directory` | `path,purpose,folderPolicyId`    | Осмысленная папка по ENG-03; parents входят в план явно, пустой каркас не создаётся автоматически.              |
| `move`             | `from,to,expectedVersion`        | Источник/ограниченное дерево и destination проверяются целиком; import/registration edits входят в тот же план. |
| `remove`           | `path,expectedVersion`           | Указанный объект/дерево отправляется в quarantine по disposition policy, без неявного recursive delete.         |

Generated output не является допустимой целью обычного edit. Перемещение или
удаление generated объекта проходит owner/generator plan. Вычисляемые refs,
imports и новые регистрации включаются в план с объяснением причины; неполный
resolver coverage останавливает зависимую операцию. Другие эффекты, включая
Git, task mutation и deployment, имеют свои отдельные commands/approvals.

Основные выходные типы:

- `OperationPlan`: `schemaVersion,operationId,planId,planHash,createdAt,expiresAt,
targetRef,sourceManifestHash,policyRefs,recipeRefs,effects,checkSelection,
taskRefs,coverage,budgets`. Полный private manifest содержит content/version
  refs; публичная проекция не раскрывает secrets, OS paths или grant signature.
- `FileVersion`: `kind,sha256|null,size,mode,identityRef`; directory version
  включает ограниченный полный inventory, absent version — точную цель и parent
  namespace version. `identityRef` непрозрачен; runtime хранит dev/inode/тип.
- `OperationView`: `schemaVersion,operationId,revision,state,attempt,planRef,
effectsSummary,checksSummary,bindingState,receiptRef,cancelState,writeBlock,error,nextAction`.
  `effectsSummary` различает `none`, `partial`, `applied`, `compensated`, `unknown`;
  проверки — `not_run/running/passed/failed/stale/incomplete`; binding —
  `not_required/pending/satisfied/conflict`. Outcome не сводится к одному boolean.
- `OperationReceipt`: immutable ID/revision, origin (`typed` либо `observed`),
  plan/request hashes, actor kind/ID, target/version, фактические effects,
  before/after refs, changed artifact paths/hashes, check receipt refs, task/Git
  refs, timestamps и limitations.
  Исправление результата создаёт следующую связанную запись, не переписывает старую.
- Ошибка: `{code,message,retryable,phase,operationId|null,detailsRef|null}`.
  Коды: `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `UNSUPPORTED`, `EXPIRED`, `LIMIT_EXCEEDED`, `DEPENDENCY_UNAVAILABLE`,
  `CHECK_FAILED`, `RECOVERY_REQUIRED`, `CANCELLED`, `INTERNAL_ERROR`.
  `retryable` разрешает повтор того же запроса, не новую запись/новый key.

Envelope facade: `{schemaVersion:1,requestId,ok:true,data}` либо
`{schemaVersion:1,requestId,ok:false,error}`. Accepted async — HTTP 202 с handle,
не success receipt. Error status: input 400, auth 401/403, missing 404,
conflict/recovery 409, expired 410, size 413, unsupported 422, rate 429,
dependency 503, internal 500. Async check/process failure читается через `get`.
Mapper возвращает только перечисленные поля, без raw Payload/FS/process objects.

## 3. План, preview и idempotency

План immutable, default TTL 30 минут, максимум 2 часа по host policy. В hash
входят protocol/normalization version, target revision, intent, exact content
hashes, полный bounded read/write manifest, effective folder/policy versions,
generator/command manifests, выбранные checks и их inputs. Время операции,
серверные IDs и транспортные labels не заменяют значимые версии входов.

Private source manifest включает исходники и namespace/negative lookups, от
которых зависят отсутствие destination, resolution импортов и размещение.
Замена файла на другой inode с теми же bytes обнаруживается identity guard;
hash одного редактируемого файла не подтверждает весь read set.
Preview может быть пагинирован; `coverage.complete` относится к **плану**,
а `hasMore` — к выдаче diff. Усечённый scan не даёт complete/applicable plan.
Точные frozen outputs сохраняются до применения; apply не запускает новый
генератор под старым preview. Replan создаёт новый plan ID и инвалидирует старый
apply admission, но не изменяет уже начатую операцию задним числом.

Неистёкшие content refs атомарно привязываются к плану и удерживаются от GC
до завершения его retention/recovery obligations. Replan допустим только до
первого live эффекта; после него изменения проходят recovery либо новую операцию.

Новый command hash — SHA-256 versioned canonical JSON: сортировка ключей,
сохранение порядка массивов, запрет undefined/NaN, hash exact blob bytes.
Key namespace: installation/workspace, actor kind/ID, client binding, command
name и request UUID. Один key + иной command hash → `CONFLICT`; совпадение
возвращает прежнюю операцию/результат после fresh ACL, без повторения эффектов.
Исходная identity не пересчитывается из изменившегося текущего project/target.
Legacy Task/Git hashes остаются в своих версиях; новый protocol их не заменяет.

Replay lookup выполняется после актуальной авторизации и перед CAS новой
мутации: прежний `expectedRevision` входит в command hash и не мешает чтению
receipt того же запроса. CAS проверяется только при принятии новой команды.

До принятия command durable store атомарно резервирует key и operation binding.
Терминальные payload могут быть очищены по retention, компактный tombstone
сохраняет key/hash/operation/outcome: очищенный результат возвращает `EXPIRED`,
не исполняется снова. Tombstones сохраняются до снятия installation/workspace
с обслуживания; при квоте новые команды отклоняются, старые ключи не забываются
молча. `writeBlock=fs_unresolved|writer_unconfirmed` блокирует новую live запись
в checkout, даже с иным key. `checking`, failed checks и pending task binding
при подтверждённых FS effects и остановленных writers имеют `writeBlock=null`:
не держат ни kernel lock, ни бессрочную логическую блокировку checkout.
Повтор после неопределённого исхода начинается с `get/inspectRecovery`.

Подтверждённый, но незавершённый partial batch имеет `fs_unresolved` до
`resume/compensate/retain_partial`, даже если writer уже остановлен и все
промежуточные версии известны. Полностью подтверждённый apply при failed checks
или pending binding такого ограничения не создаёт.

Планирование не требует отдельного согласования каждого файла, если effects
уже разрешены заданием/grant. Расширение scope и непокрытая доставка проходят
отдельный admission по ENG-05. Plan hash доказывает содержимое, не полномочие.

## 4. Состояния, journal и границы эффекта

Основной путь: `planning → planned → applying → checking → completed`.
`planning` может исполнять допущенный генератор в изолированном staging; live
checkout ещё не меняется. Failure до первого эффекта → `failed` с effects=none.
No-op подтверждается версиями и возвращает receipt без ложного изменения.

| Событие                                                      | Состояние/следующий шаг                                                                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| CAS/policy/namespace изменились до эффекта                   | `conflict`, effects=none; новый план после чтения актуальных входов.                                                                          |
| Часть FS записей выполнена, следующая не подтверждена        | `recovery_required`, partial/unknown; запрет новых live writes до разбора.                                                                    |
| Все writes выполнены, check не прошёл или stale              | `failed`, effects=applied, checks=failed/stale; файлы не откатываются автоматически.                                                          |
| Проверки пройдены, обязательная task binding не подтверждена | `reconcile_required`, effects=applied; повтор только binding через её owner.                                                                  |
| Пользователь отменил/истёк допуск                            | `cancelling` до подтверждённой остановки; затем `cancelled` при none или `recovery_required` при partial/unknown.                             |
| Отмена во время checks после всех writes                     | После подтверждённой остановки `cancelled`, effects=applied, checks=incomplete; файлы и pending binding сохраняются, rollback не запускается. |
| Handle утрачен, writer не доказанно остановлен               | `recovery_required`, cancelState=stop_unconfirmed; takeover/write запрещены.                                                                  |
| Компенсация exact версии завершена                           | `compensated`; это отдельный outcome, не успешное выполнение первоначальной задачи.                                                           |
| Частичные результаты осознанно оставлены                     | `partial_retained`; зафиксированный manifest и причина, не completed/succeeded.                                                               |

`completed` требует подтверждённых writes/no-op, required checks passed и всех
обязательных bindings. Это успех операции, не автоматическая приёмка/закрытие
задачи ENG-04. Receipt отдельно показывает состояние на момент проверки;
новая правка делает его неприменимым, а не переписывает прошлое событие успеха.

Journal — private runtime state вне checkout/Git, с owner/mode/no-follow guards.
Он хранит schema version, command identity, frozen plan и content refs, revision,
attempt, lease/fence refs, actor/admission refs без secrets, ordered effect steps,
before/after версии и durable process refs. Store обязан обеспечивать atomic
metadata transaction (operation revision + key reservation + state), CAS и fsync
до подтверждения команды. Конкретный storage adapter и его crash proof — ENG-07;
несколько несогласованных JSON writes этим требованием не удовлетворяют.

План содержит последовательные pre/post namespace versions с учётом ранее
выполненных шагов batch. Неразрешимые пересечения source/destination либо
неподдержанная перестановка дерева отклоняются до apply. Для create/edit,
включая создание directory, объект готовится приватно на том же filesystem;
его identity сохраняется до publication. Move/quarantine сохраняют identity
переносимого объекта. Поэтому expected after включает известный новый inode,
а не ошибочное требование равенства inode исходного edit-файла.

Для каждого FS effect: сохранить `prepared` и backup/content → fsync →
проверить допуск и precondition под lock → сохранить `effect_pending` → fsync →
выполнить один FS primitive → fsync файла/каталогов → сверить результат →
сохранить `effect_confirmed` с cursor. `effect_pending` не считается отказом
и не разрешает повторную запись без осмотра. Итоговый immutable receipt
публикуется до снятия pending и emission completion event.

FS backend первого релиза — проверенный Linux, local filesystem, один host.
Создание использует publication без замещения существующей цели; edit —
подготовленный файл того же filesystem и atomic replace; move — no-replace,
delete — rename в private quarantine того же filesystem. Cross-device move
отклоняется; copy+delete не выдаётся за atomic move. Root/parents разрешаются
через directory descriptors без следования symlinks. Symlink, hardlink,
special files, неподдержанные ACL/xattrs/setuid и неизвестный тип требуют
`UNSUPPORTED`, а не ослабления guards. Поддержанные mode сохраняются; chmod/chown
не являются скрытым побочным эффектом edit. Multi-file atomicity не обещается.

## 5. Блокировки, конкурентные клиенты и процессы

Workspace identity задаёт host, canonical root и доверенный private state root;
CLI и control plane не могут выбрать разные namespace для одного checkout.
Порядок для mediated writes: **workspace kernel lock → Git lock при Git-фазе**.
Git lock остаётся общим по git-common-dir для связанных worktrees. Несколько
workspace в одной операции первой поставкой не поддерживаются.

Runtime не держит workspace lock весь модельный turn. Snapshot/revalidation,
live apply и recovery удерживают его в своих коротких фазах. Генератор работает
в изолированном staging; checks запускаются без Git lock и без блокировки live
checkout на весь test suite. Verification receipt lock берётся после освобождения
workspace lock; runner не вызывает вложенные workspace mutations. Git preparation
выполняет checks до Git-фазы и повторно сверяет fingerprint после захвата locks.

Model turn, verification preparation и ожидание пользователя происходят до
захвата workspace/Git locks. Broker delegation относится только к программной
фазе Git handler; под locks handler повторно сверяет evidence/fingerprint.
Межпроцессный broker владеет workspace kernel lock и выдаёт одноразовую
delegation capability точному дочернему action/operation/fence; дочерний handler
не захватывает тот же lock повторно. Capability передаётся по приватному IPC,
проверяется как live handle и не принимается из request JSON. До передачи
capability сохраняется `delegation_pending` с operation/fence, durable process
boundary ID и точным action; после завершения — termination proof/confirmation.
Git `existingLease`
остаётся живым объектом внутри процесса Git handler. Broker ожидает termination
дочернего action, включая наследников, до освобождения ответственности; потеря
связи/handle означает stop_unconfirmed. Git worker route и его approvals
сохраняются: новый broker не заменяет worker shell-командой основного агента.
Адаптер, ещё не подключённый к broker, не объявляется участником общего lease.

Lease — сведения о владельце и freshness, kernel lock — взаимное исключение.
Expiry 30-секундного authorization lease посылает cancel, но не разрешает
«украсть» lock у живого writer. Снятие stale owner требует boot/process start
identity и подтверждённой остановки, не одного PID/возраста файла. После crash
новый process получает kernel lock, читает pending и сначала выполняет recovery.
Fencing number проверяется при каждой mediated записи; сам по себе он не
останавливает произвольный OS-процесс.

Нет вложенной PostgreSQL transaction вокруг FS/Git/check процесса. Task handler
сохраняет свой actor → project → domain locks порядок; cross-project locks
упорядочены по IDs, graph lock ENG-04 предшествует зависимому project set.
Access locks берутся после domain locks в порядке client → grant → credential,
внутри класса — по IDs; revoke/refresh соблюдают тот же порядок и не захватывают
task/workspace/Git locks. Immutable binding IDs разрешаются до locks, затем
перечитываются под ними. Авторизация
присоединяется к transaction поддержанным access port, не повторным вызовом
запрещающего nesting wrapper. Adapters должны проверить отсутствие обратного
захвата в реальном коде до activation; target порядок не меняет старый wrapper.

Допуск повторяется перед каждым effect и после ожидания lock. DB revoke,
зафиксированный до точки admission, закрывает действие. Для FS/сети/процессов
есть промежуток между admission и эффектом; после него нельзя обещать отмену
уже завершённой записи. Run handle хранит host/boot identity, PID/start time,
process group и внутренний nonce; remote DTO содержит только opaque handle ID.
Cancel → SIGTERM → grace 2 секунды → SIGKILL управляемой группе → подтверждение
завершения. Пока stop не доказан, запись и компенсация не продолжаются.
Native-v2/legacy-native остаются отдельными режимами ENG-05.

Process group недостаточна для descendants, сменивших session/group. Typed child
adapter обязан обеспечить durable containment (например, host-managed cgroup
с запретом выхода), переживающий crash broker, и проверяемое отсутствие writers.
Если этого нельзя обеспечить, typed execution не активируется; для разрешённого
native режима результат остаётся stop_unconfirmed, пока остановка не доказана.
Смерть broker/освобождение flock сама по себе не разрешает takeover при живом
delegated writer. Process refs и delegation journal нужны и после перезапуска.

Внешние IDE/native writers не участвуют в advisory lock. Повторная проверка
версий и post-write audit обнаруживают многие конфликты, но не гарантируют
предотвращение каждой гонки/ABA между check и replace. Watcher не исправляет
эту границу. Remote typed execution требует изоляции своего trusted runtime;
полной изоляции native owner-host программа не обещает.

## 6. Восстановление и task/Git binding

`inspectRecovery` получает безопасный read snapshot; если writer ещё активен,
возвращает ожидание/stop_unconfirmed. Recovery plan фиксирует operation revision,
cursor, фактические FS версии, process termination, policy/admission requirements
и конкретные actions. ID предложения выводится из hash значимых полей snapshot
без текущего времени; чтение не записывает journal. `recover` реконструирует
предложение и сверяет hash/версии под workspace lock перед durable admission.

| Состояние шага после crash                                                        | Допустимое решение                                                                                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| До `effect_pending`, live равен before                                            | Продолжить тот же frozen шаг после fresh admission.                                                                                            |
| `effect_pending`, live точно равен after                                          | Подтвердить уже совершённый effect, не повторять primitive.                                                                                    |
| `effect_pending`, live точно равен before                                         | Выполнить ещё не состоявшийся effect только после проверки отсутствия живого writer.                                                           |
| Current равен cumulative manifest на cursor boundary                              | Forward resume с текущего шага; сверяется всё вычисленное состояние с учётом изменений namespace предыдущими шагами, не только последний файл. |
| Live не совпадает с допустимым before/after, journal повреждён или target rebound | `RECOVERY_REQUIRED/CONFLICT`, без overwrite; сохранить данные для разбора.                                                                     |
| Delete/move: неоднозначное наличие source/quarantine/destination                  | Не считать отсутствие успехом; сверить exact identities/hash и phase, иначе блокировать.                                                       |

Совпадение bytes само по себе не доказывает авторство внешней записи. Recovery
подтверждает наблюдаемое состояние и ограничения writer coverage в receipt.
Для компенсации берётся новый разрешённый recovery plan: запись backup допустима
только если current всё ещё равен after **этой** операции. Сначала сверяется весь
rollback set, затем каждый шаг; foreign edit не затирается. Компенсация также
может оборваться и имеет собственные pending/confirmed stages. Восстанавливаются
bytes/mode; replacement публикует новую identity, которая сохраняется как результат
компенсации, а не выдаётся за исходный inode. Repeated recover
с тем же key возвращает тот же attempt; иной key не обходит revision/fence.

Неразрешимый конфликт не требует удалять pending вручную. `retain_partial`
разрешён владельцу восстановления только после остановки writers и сохранения
точного current manifest, причины и оставшихся расхождений. Это освобождает
checkout для отдельной исправляющей задачи, не стирая journal/history и не
объявляя исходный план выполненным. Quarantine/pinned evidence не очищаются.

Связь с задачей — отдельная durable outbox запись. Подтверждение FS result и
binding intent сохраняются одной journal metadata transaction; crash не оставляет
подтверждённый обязательный результат без восстанавливаемого outbox intent.
Она содержит stable operation/result ID, actor, exact task version и payload hash;
доставка использует idempotency domain owner. Lost response → чтение/replay того
же запроса, не новый result. Изменившаяся task revision/ACL даёт binding conflict;
reconcile сначала устанавливает исход предыдущей доставки, затем планирует новую
разрешённую попытку привязки. Engineering operation/result ID остаётся прежним;
меняется только binding attempt/request ID. Domain uniqueness предотвращает
дублирование результата. Файловая часть не повторяется.
Optional binding не удерживает completed, но явно pending;
обязательная удерживает reconcile_required. DB transaction не охватывает FS.

Git receipt связывается с точным repository/ref/OID и proof существующего Git
owner. Успешный file apply не означает commit, push или deploy. Unknown push
разбирается Git owner; общий journal хранит ссылку, не дублирует Git recovery.
Проверки не перезапускаются ради link/replay или другого текста отчёта.

## 7. Генераторы и доверенное выполнение

`GeneratorRecipe` принадлежит project binding: `id,version,parameterSchema,
executableRef,argvTemplate,runtimeRef,dependencyManifest,inputSelectors,
outputRules,sideEffects,deadline,resourceLimits,determinism,requiredScopes,
checks,dependencyRecipeIds`. Trusted activation хранит digest исполняемого
профиля вне writable checkout. `.ai`/package script не активируют его сами.
Клиент передаёт только recipe ID и валидируемые параметры, не shell/executable/env.

Input manifest включает transitive исполняемые imports/hooks/config, runtime,
dependencies и declared environment; secrets передаются доверенным port без
логирования. Если полноту executable closure/изоляции нельзя подтвердить,
recipe не доступен как typed generator. Разрешённый native запуск остаётся native
с observed outputs и явно меньшим покрытием; его нельзя выдавать за typed apply.

Подготовка: заморозить bounded inputs → проверить manifest/digest и допуск →
запустить native generator в private изолированном staging → дождаться выхода
и остановки writers → перечислить/проверить весь output → построить frozen plan.
Sandbox запрещает записи вне staging и недекларированные сеть/БД; одного cwd
недостаточно. Live inputs перед apply должны совпасть с исходным manifest.
Partial outputs, extra files, превышение limits или неисчезнувший процесс
блокируют публикацию плана. Секреты/временные outputs не попадают в live diff.

Переиспользуются штатные `payload:generate-types`, `payload:generate-importmap`,
`payload:migrate:create`; создание migration не выполняет `payload:migrate`.
Для migration preview требуемое schema чтение происходит через явно разрешённый
versioned источник/isolated fixture, а не неявное подключение к рабочей БД.
System AI publisher и activation остаются у своего domain owner; генерация
repository source не перезаписывает immutable installation release.

Recipes образуют DAG, исполняются в топологическом порядке с точными versions.
Цикл/неизвестная зависимость/неполное раскрытие → ошибка до исполнения. Generated
output предыдущего шага — зафиксированный input следующего. Детерминированные
карты имеют stable ordering и не добавляют текущее время; недетерминированный
native output фиксируется exact bytes в плане, не обещается повторяемым по hash
одних исходников. Имя/timestamp migration фиксируется при подготовке.

Generated sections следуют ENG-03: recipe владеет только зарегистрированным
диапазоном, сохраняет authored bytes. Проверяются исходный hash всего документа,
пара маркеров и отсутствие вложений/дубликатов вне code fences. После preview
любое изменение документа вызывает conflict/replan; молчаливого merge нет.
Совпавший output → no-op, без write event и следующего auto-generation цикла.

## 8. Проверки и стоимость

Binding выбирает конечный `CheckSelection` с reason и coverage из effects/types,
read/write sets и известных зависимостей. Required checks задаются owner policy,
клиент не может снять их request-полем. Если dependency coverage неполно, выбрать
bounded owner scope либо вернуть incomplete с причиной. Автоматический полный
suite запрещён; широкий набор требует конкретного риска и разрешённого бюджета.

План переводится в существующий `VerificationPlan v1`: explicit input paths,
закреплённые команды `node/npm`, scope/reuse/timeout. Fingerprints включают
значимые inputs, recipe, runtime/dependencies и среду; current passed receipt
переиспользуется только при совпадении. DB/browser/live-state checks используют
`reuse:never`, пока нет отдельного поддержанного versioned proof.
Before/after/final checks существующего runtime сохраняются.

Генерация — mutation phase до checks, а не check с самоменяющимися inputs.
Проверки работают по итоговому manifest в immutable snapshot с подтверждённым
dependency materialization. Live checks допустимы только при обеспеченном
запрете записи в checkout и вынесенных writable outputs; существующий runner
сам такой изоляции не даёт. Без этих условий нужен snapshot либо `UNSUPPORTED`.
При live checks новая внешняя правка делает
receipt stale и требует адресной повторной проверки, не rollback. Отдельное
stage-only passed без сравнения итогового live manifest не завершает apply.

После checks короткая финальная фаза берёт workspace lock, сверяет весь итоговый
manifest/check bindings и публикует результат. Новая версия → stale/incomplete,
не ложный completed. Проверки не удерживают checkout логически всё время запуска.
Current runner хранит latest receipt на check. Journal архивирует проверенную
immutable копию evidence с receiptId/key/recipeKey, result и source/runtime refs
до публикации operation receipt. Mutable logPath не является постоянным proof.
Это новый storage contract, не изменение legacy verification DTO.

Общий deadline включает inputs enumeration/hashing, очередь, spawn и cleanup.
Нынешний command timeout не даёт такой гарантии: bounded/cancellable checkpoint
adapter должен быть реализован до объявления полного deadline. При недоступном
адаптере capability ограничена явно; timeout нельзя объявлять passed.
Receipt хранит измеренные wall time, bytes, inputs/check count, reused/executed
и ограничения. Bytes не переводятся в выдуманный расход токенов модели.
CLI/IDE usage accounting этим протоколом не добавляется.

## 9. События, очередь и наблюдение

Событие: `schemaVersion,id,workspaceId,epoch,seq,operationId|null,attempt|null,
origin,kind,observedAt,changedPathRefs,manifestRef,causationId|null,coverage`.
`origin=typed|observed`; external/native наблюдение не присваивает actor или
successful executor receipt. Completion event выводится из durable journal
через outbox; crash между receipt и публикацией даёт replay события с тем же ID.
Доставка at-least-once; consumers дедуплицируют по epoch/seq/ID.

Cursor opaque и связан с actor/access scope/workspace/epoch/filter, не с offset
по изменяемому списку. Subscription повторяет authorization по lease ENG-05.
Истёкший cursor/retention gap/epoch reset → `resync_required` и bounded snapshot,
а не «изменений нет». Reconnect читает snapshot с watermark и events после него;
если scan пересекает новый gap, coverage остаётся incomplete.

Очередь coalesces paths и reasons, но не забывает overflow: выставляет dirty
workspace и coverage=incomplete, затем планирует bounded reconciliation.
Startup, watcher overflow и пропущенные события также требуют reconciliation.
Realtime watcher не является доказательством отсутствия внешних изменений.

По умолчанию watcher назначает checks, не исправляет файлы. Auto-generation
разрешается отдельной policy/grant для конкретных recipes/targets. Ключ работы:
recipe version + input manifest + policy version; совпадение coalesces запросы.
Output events обновляют observation, но не запускают тот же recipe по тем же
inputs. Causation chain ограничена; цикл или повтор без сходимости останавливает
auto-generation с диагностикой, не бесконечными retries. Исправление imports,
карт и registrations всегда проходит обычный plan/apply и сохранённое разрешение.

## 10. Измеримые пределы первой реализации

Это целевые defaults/hard caps нового adapter, не описание существующего runner.
Host может уменьшить их; увеличение требует versioned policy, а не аргумента
модели. Превышение до live эффекта → limit/incomplete. После эффекта outcome
определяется фактическим manifest и остановкой writers: подтверждённый полный
apply допускает cancelled/applied с incomplete checks; partial/unknown либо
stop_unconfirmed требуют recovery. Нельзя обрезать данные и объявить план или
check полным.

Effective limit — минимум нового budget и всех вызываемых owner limits.
Текущий verification input reader ограничен 50 000 entries/depth 48/256 MiB,
Git proof binding — 2048 paths. Больший scan budget не повышает эти пределы;
адаптер отказывает с coverage/причиной, не усекает manifest молча.

| Объект                             | Default / hard cap                                                         | Поведение при пределе                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Command JSON / actions             | 128 KiB / 1 MiB; 64 / 256 actions                                          | Отклонить input; blobs передаются отдельно.                                                                                           |
| Content blob / total planned bytes | 8 MiB / 32 MiB; 64 MiB / 256 MiB                                           | Reject до сохранения/записи; stream и hash с byte limit.                                                                              |
| Traversal                          | 20 000 / 100 000 entries, depth 32 / 64, 256 MiB / 1 GiB прочитанных bytes | incomplete; исключения explicit, не отсутствие файлов.                                                                                |
| Scan / plan wall time              | 5 / 30 секунд; 30 / 120 секунд без generator time                          | Cancel bounded reader; нет complete plan.                                                                                             |
| Полный attempt wall time           | 10 / 60 минут, включая очередь/hash/process/cleanup                        | Admission каждого эффекта обновляется в исходных пределах ENG-05; истечение общего deadline → cancel/recovery по фактическим effects. |
| Generator DAG / process            | 8 / 16 recipes; 120 / 600 секунд каждый                                    | Остановить; без публикации частичного output.                                                                                         |
| Checks                             | 1–64; default 120 секунд, cap 1 800 секунд на command                      | Совместимо с текущим v1 validator; общий deadline дополнительно.                                                                      |
| Output child process               | 8 MiB aggregate, capture ≤64 KiB каждого stream, diagnostic ≤8192 chars    | Cancel/reject output overrun; counts/hashes остаются.                                                                                 |
| Public page                        | 100 / 500 items и 256 KiB; diff 128 KiB на page                            | Cursor/hasMore; oversized item → artifact ref с отдельным ACL.                                                                        |
| Workspace mutation / planning jobs | 1 live mutation; 2 подготовки, очередь 100                                 | Busy/429 с Retry-After; никакого второго lock namespace.                                                                              |
| Lock wait / cancellation           | 5 / 30 секунд wait; TERM grace 2 секунды                                   | Busy либо stop_unconfirmed; lock не отбирается по TTL.                                                                                |
| Watch queue / debounce             | 10 000 paths и 8 MiB; 500 ms, max latency 5 секунд                         | Coalesce; overflow → dirty/incomplete и reconciliation.                                                                               |
| Auto-generation                    | depth 8, не более 3 повторных планов recipe в одной causation chain        | Stop cycle/nonconvergent, требуется разбор входов.                                                                                    |
| Event retention / cursor           | 7 дней и 100 000 событий, не более 128 MiB; cursor TTL 10 минут            | Старые event pages → resync_required; journal не удаляется вместе с events.                                                           |
| Journal payload / tombstones       | 30 дней terminal payload; tombstones ≤1 000 000 и 256 MiB                  | Compact без потери key identity; при квоте запрет новых commands до обслуживания.                                                     |
| Workspace private storage          | 10 GiB default, 20 GiB cap                                                 | Reserve перед prepare/apply; pinned/recovery/backups не удаляются ради новой операции.                                                |

Лимит storage включает staging, backups, outputs, journal и зарезервированный
объём для finish/recovery записи. Quota failure не должна мешать уже принятой
операции записать её состояние. Pending/recovery/active process и ссылки
удержания исключены из GC. Удаление terminal disposable данных происходит по
заранее установленной retention policy; восстановление из уже purged backup
не обещается. Для native/process streams сохранение полных логов не требуется.

## 11. Приёмка и последовательность внедрения

| Сценарий                                                          | Обязательное доказательство                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Повтор apply после lost response / другой body с тем же key       | Один effect/operation; frozen result либо conflict, без повторной записи.                                      |
| Два клиента редактируют одну версию, edit после move/delete       | Один проходит, второй получает CAS/namespace conflict; current bytes сохранены.                                |
| Crash до pending, после primitive, до cursor, до completion event | Recovery на каждом окне; совпавший after не исполняется повторно; outbox дедуплицирован.                       |
| Crash во время создания/переноса/quarantine/компенсации           | Нет неучтённого partially published файла; before/after/identity и оставшиеся данные подтверждены.             |
| Foreign write, symlink/parent/root replacement, cross-device move | Отказ/diagnostic с честным пределом external-writer coverage, без притворного global CAS.                      |
| Частичный generator output, extra file, изменение script/input    | Live checkout не меняется; план не публикуется или конфликтует перед apply.                                    |
| Большой scan, очередь/retention gap, неподдержанный resolver      | incomplete/resync_required; нет ложного passed и бесконечного фонового цикла.                                  |
| Revoke/expiry, потеря handle, живой detached writer               | Нет нового admission/takeover; cancel и stop_unconfirmed отражают действительность.                            |
| File apply прошёл, task binding/replay не прошёл                  | FS не повторяется; reconcile_required/optional pending, авторизация и task IDs сохранены.                      |
| Несколько worktrees/CLI/Admin/Git adapters                        | Один workspace namespace, порядок locks, отсутствие вложенного deadlock; непереносимый lease не сериализуется. |
| Изменённый/неизменный check input, DB/browser state               | Адресный rerun либо подтверждённый reuse; live checks never, suite не расширяется без причины.                 |
| Старые Tasks/access/MCP/native journals                           | Старые hashes/ACL/сессии сохраняются; target capability не выдаётся за активную.                               |

Это будущие runtime checks. На этапе ENG-06 проверяются связность спецификации,
совместимость с источниками и документационные ссылки; приложение не тестируется
заново ради текста. ENG-07 реализует DTO/store/lease/state machine/события;
ENG-08–12 — FS adapters и recovery; ENG-13–15 — recipes/maps; ENG-18/20 — task/Git
bindings; ENG-21–23 — три клиента; ENG-24–27 — bounded observation; ENG-28–30 —
crash/concurrency/cost и activation. Недостающий adapter не получает capability.

## 12. Реализованное основание ENG-07

Раздел фиксирует состав и ограничения этапа TASK-65 / ENG-07. Добавленные после
него content/FS adapters и project binding описаны отдельно в §13.

`packages/engineering-runtime` (`@realize/engineering-runtime`, 0.1.0) содержит
server API `EngineeringRuntime` и отдельный browser-safe export `./contracts`.
Runtime — закреплённые Node 24.18.0 / npm 11.15.0; внешних новых библиотек нет:
SQLite поставляется Node, Zod использует уже закреплённую версию проекта.

Реализованы strict schemas девяти команд, versioned canonical JSON/hash,
`plan/preview/get/apply/cancel/inspectRecovery/recover/events` и чтение последнего
immutable receipt методом `receipt(getCommand)`. `plan` возвращает OperationView
с planRef; bounded план читается через `preview`. Replay возвращает актуальную
проекцию той же операции; новые эффекты и новая подготовка не запускаются.
Actor/client, target и каталог state поступают только из trusted server config.
Fresh authorization проверяет command, intent, owner/scope и каждый effect;
port возвращает `scopeVersion` эффективного допуска, меняющийся при изменении ACL.
Cursor связан с этим значением, actor/client, выборкой, private epoch и TTL 10 минут.
Отказ права возвращает безопасную ошибку без исходного исключения adapter.

`PlanningPort` возвращает bounded подготовленные данные, exact content refs,
полный cumulative manifest перед/после каждого шага и публичные effects.
Hash фиксирует также installation/workspace/target/root identity, policy versions,
intent и task refs; время/случайные operation IDs на hash не влияют. Frozen
public projection сверяется с хешируемыми данными при чтении journal.
План действует 30 минут. Лимит prepared record основания — 256 KiB, 64 effects;
journal payload — 1 MiB. Большие manifests и blob storage требуют отдельного
adapter, не скрытого усечения. `prepareContent` schema представляет `bytes`
canonical padded base64 с отдельным лимитом decoded bytes 8 MiB; сама команда
пока возвращает `UNSUPPORTED`. Metadata остальных команд ограничена 128 KiB.

`openEngineeringStore` использует `node:sqlite`, `BEGIN IMMEDIATE`,
`synchronous=FULL`, rollback journal и CAS. Request identity, operation revision,
event и reserve фиксируются одной metadata transaction. State находится вне
checkout, проверяются owner/mode/no-follow, inode root/state и постоянный binding;
замена root или привязка существующего state к другой цели запрещены. Права —
0700 для state и 0600 для DB/sidecars. Все принятые keys сохраняются: удаления
payload/tombstones и event GC в этой версии нет; quota отказывает новой команде.
Defaults: 100 000 operations/requests/events и 1 GiB private DB, с меньшими
host limits. Перед apply резервируются metadata capacity, events и recovery
requests; последующие transitions расходуют только свой reserve. После снятия
writeBlock остаток освобождается. Резерв защищает от конкурирующих admissions,
но не гарантирует физическое место на диске при внешнем ENOSPC; неуспешный COMMIT
оставляет прежний durable pending и требует восстановления.

Lease переиспользует `acquireGitLock` из публичного API `@realize/git-runtime`
на private каталоге workspace. Это Linux flock; конкурентный захват возвращает
CONFLICT без частого опроса. Один host обязан назначать всем клиентам один и тот
же state binding; автоматического discovery/регистрации всех checkout ещё нет.
OS/native writers вне advisory lock по-прежнему остаются отдельной границей.
Storage допускает ext2/3/4, XFS, Btrfs, F2FS и overlay по Linux statfs;
tmpfs, сетевые и неизвестные типы возвращают UNSUPPORTED. Host отвечает за
постоянное хранилище устройства и backing mounts overlay: одного filesystem
magic недостаточно для доказательства power-loss durability.

Первое execution port ограничено `in_process_sync`: один синхронный durable
primitive, без subprocess и отложенных writers. Эта граница сохраняется в journal.
Перед primitive сохраняется pending, после него сверяется полный after manifest.
При crash `inspectRecovery` читает состояние под lease без изменения journal;
proposal ID/hash не зависят от времени чтения. `resume` после fresh admission
подтверждает уже достигнутый after либо выполняет ещё не состоявшийся before.
Несовпавший manifest блокирует продолжение. Неожиданный асинхронный результат
оставляет `writer_unconfirmed`; cancel не выдаёт его за остановленный writer.
Обычный partial сохраняет `fs_unresolved`. Полностью подтверждённые effects
при последующей потере актуальности остаются applied/failed с checks=stale
и writeBlock=null. No-op фиксирует effects=none. Максимум 64 attempts.

Events читаются из той же durable таблицы: исторические attempt/manifest refs
не пересчитываются по текущему состоянию операции. Public epoch получен отдельно
от приватного cursor secret. Повторное чтение сохраняет identity событий;
предметный ACL проверяется на каждой выдаче, отфильтрованная страница помечена
incomplete. Повреждённый journal не пропускается как успешная пустая страница.
Подписки, event GC, snapshot/resync facade и watcher ещё не реализованы.

Ограничения подключения:

- Production FS/content adapters, классификация и descriptor-relative guards —
  ENG-08–12. Тестовый файловый port служит только fixture и не экспортируется.
- `compensate/retain_partial`, process containment, bounded asynchronous scanner,
  генераторы, Verification/task/Git bindings требуют своих следующих adapters.
  Непустые checkSelection/recipeRefs и generate intent сейчас отклоняются;
  check runner не копируется. Task refs не означают доставку или приёмку задачи.
- Deadline 30 секунд подготовки / 10 минут attempt проверяется между trusted
  синхронными вызовами; зависший adapter нельзя прервать этим ядром. Полный
  cancellable deadline не объявлен реализованным.
- `.ai/tools/engineering`, control-plane host, новые CLI/Admin/MCP endpoints и
  scopes ещё не активированы. Существующие native/Git/Task маршруты не переключены
  на новый package. Ядро само не выдаёт доступ к платформе или машине.

Адресные проверки находятся в `packages/engineering-runtime/test`: strict DTO,
canonical JSON, replay/CAS/ACL, bounded preview, cancellation, stale/unknown
outcome, SQLite rollback/reopen/quota, межпроцессный lock, SIGKILL до COMMIT
и после filesystem primitive с продолжением без повторной записи. Проверки
запускаются через существующий `git:verify` с source-bound receipts; весь app
suite и browser build не требуются для этого отдельного Node package.

## 13. Создание файлов и папок ENG-08

TASK-66 добавляет программный create-only backend к тому же runtime/journal.
Поддержаны `prepareContent` и `file_batch` из `create_file`/`create_directory`.
Target, principal, native binary, private directory и artifact descriptors
задаются доверенным host; JSON-команда не назначает owner или OS path.
Операции `edit_file`, `move`, `remove`, генераторы и новые клиентские endpoints
этим этапом не активируются.

Content хранится вне checkout одной immutable записью вместе с request identity.
`prepareContent` проверяет SHA-256 точных decoded bytes и возвращает
`contentRef,byteLength,sha256,mediaType,expiresAt`. TTL до планирования — 30 минут;
ref связан с target и principal. Повтор ключа с другим телом конфликтует,
истёкший ref не превращается в разрешение повторно выполнить тот же request.
Default decoded blob limit остаётся 8 MiB. Private content и staging имеют
отдельную квоту 128 MiB; GC в ENG-08 отсутствует, превышение отклоняет новое
размещение. Это отдельная область от SQLite metadata/reserves §12.

Планирование материализует exact bytes в private staging того же filesystem
и сохраняет identity подготовленных файлов/директорий. В immutable plan входят
все явные шаги, source/parent namespace, ожидаемые версии после каждого шага,
descriptor `definitionHash` и полный bounded `readPaths` manifest источников
правил, templates и policies. Изменение этих входов или binding между preview
и apply требует нового плана. Frozen outputs не генерируются заново при apply;
последующее истечение исходного content ref не меняет подготовленные bytes.

Каждый отсутствующий parent должен присутствовать в batch отдельным предшествующим
`create_directory` с назначением и effective folder policy. Неявного recursive
mkdir, пустого каркаса, `.gitkeep` и автоматических INDEX нет. FS owner проверяет
коллизии имён/регистра, root/parent identity, types и no-follow boundary;
project binding отдельно проверяет owner, kind, provenance и native metadata.

Publication использует Linux `renameat2(RENAME_NOREPLACE)` через небольшой
Node-API addon с ABI version 8. Он выполняет один synchronous primitive без
замещения существующей цели; перед ним сохраняется durable pending, после него
синхронизируются каталоги и подтверждается exact staged identity. Обычный
`rename` с overwriting и shell `mv` не служат fallback. Другой filesystem,
symlink/hardlink, неподдержанные modes/ACL/xattrs или тип возвращают отказ.
Journal/recovery сохраняет прежний operation ID и подтверждает достигнутый after
без повторной публикации. Перед продвижением pending cursor вызывается
синхронный `confirmDurable`: повторный `fsync` обоих namespace устраняет окно
сбоя между rename и fsync. При ошибке barrier pending сохраняется; затем manifest
сверяется ещё раз. `inspectRecovery` остаётся только чтением.
Advisory lease по-прежнему не изолирует внешних
native writers.

Native binary собирается отдельным явным host шагом вне checkout. Runtime
не запускает compiler или subprocess ради загрузки и не устанавливает бинарник
автоматически. Loader принимает только trusted абсолютный path и SHA-256,
проверяет Linux/закреплённый Node, owner, отсутствие symlink и hardlink,
private parent 0700 и regular binary 0600. Загружается проверенный открытый
descriptor; native artifact не передаётся через request JSON. Сборка бинарника
сама по себе не включает клиентский write capability.

Начальный ENG-08 adapter `.ai/tools/engineering` поддерживал `source.util` и
`ai.template`; детали — [ENG-03, §8](engineering-artifacts.md#8-начальный-project-binding-eng-08).
Расширение source profiles описано в [§18](#18-source-profiles-третий-срез-task-94).
Metadata validation выполняется до записи точных bytes. `validatedChecks`
перечисляет только фактически выполненные formal guards. Дополнительные
`requiredCheckRefs` trusted policy не удаляются: если их нельзя исполнить
подключённым runner, операция получает `UNSUPPORTED` до live эффекта.
Успешные header/syntax checks не объявляют пройденными typecheck, lint,
семантический review или отсутствующие relationship resolvers.

Receipt дополняется `createdArtifacts`: относительный `path`, `kind` и
`sha256` созданного файла; для directory content hash отсутствует (`null`).
Приватные staging paths и raw FS descriptors в DTO не выдаются. Task refs
по-прежнему не означают binding, доставку или приёмку Task Manager.

Ограничения этапа: программный API без CLI/MCP/Admin activation; два authored
profiles; нет edit/move/remove, генераторов, компенсации/retain_partial,
автоматического GC, полнофункционального check runner и task/Git bindings.
Полный каталог descriptors и гарантии для native writers остаются последующими
этапами. Адресные проверки размещены в `packages/engineering-runtime/test` и
`.ai/tools/engineering/test`; наличие этого раздела не заменяет их source-bound
результаты и не служит свидетельством прохождения проверок.

Начальный FS binding допускает ASCII в новых путях и консервативно сравнивает
существующие имена через NFKC/lowercase. Ограничения: 64 effects, 512 tracked paths,
4096 entries на namespace, суммарно 16384 entries/64 MiB чтения и 128 KiB полного
preview; общий frozen plan ограничен 256 KiB. Превышение не усечётся до успешного
плана. Это ограничения реализации ENG-08; более широкие target budgets §10
не являются уже доступными лимитами.

## 14. Редактирование файлов ENG-09

ENG-09 расширяет общий Linux filesystem adapter действием `edit_file` для
поддержанных authored profiles `source.util` и `ai.template`. JSON-команда
содержит `path`, `expectedSha256` и immutable `contentRef`; исходная версия
сверяется по SHA-256 точных bytes и descriptor identity до создания плана.
Generated, mixed, vendor, неизвестные и неоднозначно классифицируемые файлы
отклоняются. Тип существующего артефакта определяется trusted binding по его
текущему содержимому; новые bytes проходят тот же profile validator.

План строит bounded UTF-8 preview и включает исходную identity/mode файла,
новую staged identity, namespace родителей, definition hash binding и прочитанные
policy/validator references. Между plan, preview и apply сверяется полный
manifest; изменившийся SHA, inode, mode или namespace требует нового плана.
Новый файл наследует прежний mode. Неизменяемый исходный inode удерживается
в private staging как backup: Linux `renameat2(RENAME_EXCHANGE)` одним syscall
атомарно меняет live и staged files, после чего синхронизируются обе директории.
Промежуточного состояния с отсутствующей целью нет. Durable pending предшествует
exchange; recovery отличает точный before от exact after и подтверждает fsync
уже применённого обмена без его повтора. Неизвестное или чужое состояние
блокирует автоматическое продолжение.
Успешный immutable receipt включает `changedArtifacts` — относительные paths,
kind и SHA-256 итоговых bytes для create/edit и destination успешного core move;
прежнее поле `createdArtifacts`
остаётся совместимым с ENG-08. Private backup paths и raw descriptors не выходят
из runtime DTO.

Edit сохраняет только поддержанные mode и точные bytes; ACL/xattrs, symlinks,
hardlinks, special files, generated targets и другие unsupported metadata
отклоняются прежними filesystem guards. Backup остаётся в private staging и
учитывается общей квотой 128 MiB; автоматического GC и компенсации ENG-09 не
добавляет. External native writers не исключаются advisory lease. Прочие ограничения
ENG-08 сохраняются. Реализация находится в `packages/engineering-runtime`; для edit требуется явно пересобранный native
addon с `renameExchange`, без fallback на overwrite. Клиентские CLI/MCP/Admin
endpoints, дополнительные profiles и check runner не активированы.

Редактирование сохраняет ровно переданные UTF-8 bytes, включая Unicode, CRLF/LF
и наличие завершающей новой строки; patch application и преобразование encoding
не выполняются. Недопустимый UTF-8 и бинарное редактирование отклоняются. Native
exchange повторно проверяет metadata обоих pinned inodes: xattrs/ACL, links,
mode и неподдержанные inode flags не обходятся прямым вызовом primitive.

## 15. Перенос и quarantine authored-файлов ENG-10

ENG-10 частично подключает к тому же filesystem planner команды `move` и `remove`
для existing regular files. Descriptor без `prepareMove` разрешает неизменённые
bytes и исходное, и новое размещение. Project profiles `source.util` и `ai.template`
подключают `prepareMove`: metadata пути и поддержанные references изменяются
явными edit effects в том же плане (§15.1). Без complete host policy операция
возвращает `UNSUPPORTED` до записи. Header/metadata guards сохраняются;
core и project binding имеют отдельные реальные integration checks. Quarantine поддержанного
authored файла доступно без преобразования bytes. Ограниченный перенос дерева
описан отдельно в §15.2; directory remove не поддержан.

Для regular files обе команды требуют `expectedVersion`, равный SHA-256 точных исходных bytes.
План сохраняет полную source identity, destination namespace, parent identities
и policy/validator references. Для move исходный профиль определяется по bytes,
а destination повторно проходит его validator в новой placement policy. Atomic
`renameat2(RENAME_NOREPLACE)` сохраняет прежний inode и отклоняет замену цели;
copy+delete не используется. Перестановки, повтор path и case-collisions внутри
batch отклоняются до записи.

`remove` убирает файл из checkout перемещением в private quarantine текущей
operation staging. Это обратимое quarantine, а не `unlink`: исходные bytes,
mode и inode сохраняются для recovery; private path и descriptor не попадают в
DTO. Quarantine учитывается общей квотой 128 MiB, остаётся pinned и не имеет
автоматического GC. Квотная ошибка останавливает план до live effect.

После каждого move/remove сверяются обе стороны namespace и точная identity;
durable pending и повторный `fsync` обоих parent directories сохраняют окна
crash/recovery из §4. Любая внешняя замена source/destination даёт conflict или
recovery-required без перезаписи. Advisory lease не исключает внешних native
writers. Права и scope по-прежнему выдаёт host через ENG-05; move не создаёт
новый owner, а destination должен пройти существующую trusted folder policy.

Ограничения file-среза: только authored regular files и поддержанные literal references
в объявленной host-области; directory move расширяет его по §15.2. Recursive deletion,
компенсация quarantine и очистка retention не подключены. Case-only rename
поддерживается в ограничениях §15.3; naming/metadata profiles сохраняются. Клиентские
CLI/MCP/Admin endpoints не активированы; текущие profiles остаются
`source.util` и `ai.template`.

Адресные проверки текущего среза: `packages/engineering-runtime/test/native.test.ts`
и `filesystemMove.test.ts` проверяют native/core, а
`.ai/tools/engineering/test/filesystemMutations.test.ts` — реальные project profiles,
version/identity conflicts, сохранение bytes/mode, quarantine и restart после
SIGKILL до/после syscall. `.ai/tools/engineering/test/projectMove.test.ts` проверяет
metadata/consumer edits, complete inventory, предварительный ACL, сохранение
BOM/CRLF/mode, итоговые hashes и SIGKILL до/после каждого из трёх native шагов.
TASK-67/68 и source-bound receipts отражают результат;
описание возможностей не заменяет выполнение проверок и не закрывает весь ENG-10.

### 15.1. Контракт project move с metadata и ссылками

Продолжение TASK-68 использует существующие `move` и `edit_file`, без нового
client command и без implicit overwrite. Trusted descriptor может подготовить
новые bytes переносимого файла и правки связанных authored-файлов. Core разворачивает
один move в последовательность: no-replace rename исходного inode, atomic edit
metadata назначения, затем точные edits consumers. Все шаги, причины, diffs и hashes
входят в один frozen plan до записи. Интервал между шагами видим и recoverable;
это не общая атомарная FS-транзакция. Исходный inode сохраняется как backup после
metadata edit. Receipt содержит последний итоговый hash каждого изменённого пути.

Host явно задаёт `movePolicy`: дату изменения `changedOn`, полную область поиска references
(`referenceRoots`, `coverage: complete`) и versioned `sourcePaths` её определения.
Это доверенная конфигурация закрытой области, а не полномочия из JSON-команды.
Заявление полноты относится только к этим roots; оно не доказывает отсутствие
внешних consumers. Host обязан подтвердить такую границу до подключения; при
неизвестном внешнем покрытии move не включается. Без полной policy возвращается
`UNSUPPORTED`. Core перечисляет все файлы и каталоги roots через descriptor-relative
reader с лимитами, без exclusions и усечения; names, пустые directories и bytes
кандидатов входят в manifest. Лимиты: 16 roots, глубина 16, 128 каталогов и 128
файлов, 256 KiB на candidate, 4 MiB на чтение move inputs, 64 развёрнутых effects
и 128 KiB полного preview. Превышение не превращается в усечённый план.
Любое новое имя или изменение после plan требует
нового плана. Symlinks, чужие mount points и превышение бюджета блокируют подготовку.

Начальный resolver допускает только однозначные `source.util` и `ai.template`
внутри этой области. Source move сохраняет basename/имя функции, обновляет
`@file`, PATCH-версию и дату; относительные literal TypeScript import/export,
import-type и dynamic import пересчитываются по AST. Extensionless, `.ts` и
`.js` → `.ts` разрешаются однозначно внутри inventory; `node:` imports сохраняются.
У изменённых source consumers также обновляются PATCH-версия и дата.
Wildcards из одного effective tsconfig поддержаны в границе §16. Остальные bare
aliases/packages, computed imports, require и неоднозначные path strings
получают `UNSUPPORTED`. Переименование публичного символа относится к отдельному resolver.

Относительные extends добавлены в §17, source profiles и сохранение JSX extension
style — в §18; эта начальная граница ENG-10 не ограничивает последующие срезы.

Разбор TS/JS и извлечение module expressions переиспользуют
`parseSyntaxSource` и `readSyntaxModuleReference` из `.ai/tools/agent-search/src/`.
`resolveModulePath`/`resolveModulePathSync` выполняют общий алгоритм с одним
config loader и `getModuleFileCandidates`. Поиск применяет порядок разрешения;
move использует строгую policy `relocation` и требует ровно одну цель в полном
inventory. Поисковые extends/workspace не расширяют поддержанный mutation
profile. Подключение move синхронное, через bounded I/O adapter,
без запуска CLI/MCP, повторного обхода файлов и поисковой telemetry.
Исходники общих модулей и их зависимостей включены в read manifest: изменение
после plan блокирует применение прежнего результата.

AI template может менять basename: обновляются `template_id`, `owner_layer`,
root-relative `related_artifacts`, локальные Markdown links и reference definitions.
Внешние URLs, code fences и inline code не переписываются. Остальные bytes и
line endings сохраняются. Все изменённые файлы проходят native validators по
финальным виртуальным paths/bytes; отсутствующие refs, неизвестные kinds,
неподключённые relationshipRules/checks, смена owner и ID collisions блокируют план.

Проверка и переписывание Markdown используют один `readMarkdownLinkSpans` из
`.ai/tools/quality/readMarkdownLinks.util.ts`. Он возвращает исходный target и
UTF-16 offsets, исключая frontmatter, fenced/indented/inline code. Прежний
`readMarkdownLinks` проецирует тот же результат в список targets; отдельного
парсера ссылок внутри move нет. YAML metadata остаётся у native template profile.

Полный набор развёрнутых effects проверяется authorization port до выдачи плана
и повторно до первого live write; свежая проверка каждого шага сохраняется.
Нельзя начать rename, если правка consumer не разрешена. Изменения прав во время
исполнения оставляют явное partial/recovery состояние. Recovery проверяет каждый
промежуточный snapshot и fsync; повторный rename/exchange уже достигнутого after
запрещён. В batch допускается один project move; пересечение его dependent edits
с явными actions запрещено. Другие явные file actions в inventory и прочитанных
зависимостях также отклоняются: они могут добавить consumer, не учтённый resolver.
Создание нужных parent directories остаётся отдельным видимым шагом batch.
Directory move и case-only rename описаны в §§15.2–15.3. Широкие semantic resolvers,
public symbol rename и host/client activation этим результатом не предоставляются.

### 15.2. Ограниченный directory move

Срез TASK-68 расширяет существующий `move`, сохраняя его поля. Directory move
является единственным исходным action batch. Источник — существующее дерево
одного owner, максимум 32 объекта вместе с корнем; поддержаны обычные authored
`source.util`/`ai.template` и существующие пустые каталоги. Новая цель отсутствует,
её parent существует. Перенос в себя, в потомка/предка,
пересечение owner boundaries, generated/mixed/vendor, неизвестные kinds,
symlink/hardlink, чужие mounts и неподдержанная metadata блокируются до записи.
Изменение только регистра basename дополнительно ограничено §15.3.

Trusted FS port `directoryVersion(path)` возвращает SHA-256 полного исходного
inventory с identity, mode, bytes hashes и всеми names/пустыми каталогами.
Manifest canonical version 1 использует относительные к корню дерева paths.
Это значение передаётся в `expectedVersion` и проверяется заново при plan.
Метод не предоставляет полномочия и не создаёт клиентский endpoint; admission
остаётся обязанностью host. Область `movePolicy.referenceRoots` сохраняется:
нельзя переносить сам reference root или его предка. Полнота внешних consumers
по-прежнему подтверждается host, а не выводится из наличия каталога.

Первый effect — один `renameat2(RENAME_NOREPLACE)` всего дерева с сохранением
inode и mode каталогов и файлов. Его `paths` содержит пары source/destination
для всех объектов (не более 64 путей). Дополнительное поле `movedArtifacts`
явно перечисляет только `from,to,kind,sha256|null`; private inode/dev и OS paths
не выдаются. Поэтому ACL проверяет также потомков, включая пустые каталоги,
до выдачи плана и до первого write. Следующие effects — metadata edits всех
перемещённых файлов и edits внешних consumers по финальному виртуальному дереву.
Все paths, diffs, причины, исходные и итоговые hashes фиксируются до rename.

Bounded manifest содержит обе стороны каждого пути и namespaces родителей.
Перед rename синхронизируются все исходные файлы и каталоги; после него и при
recovery after — всё перенесённое дерево и оба parent. Каждый промежуточный
snapshot проверяется отдельно. Неизвестные изменения не исправляются автоматически;
достигнутый rename/exchange не повторяется. Последующие metadata edits сохраняют
исходные inode в private backup. Receipt содержит каждую целевую папку с null hash
и последний hash каждого файла, включая consumers.

Остаются общие лимиты inventory, preview и 64 effects (§15.1); превышение
получает явный отказ. Directory remove, host/client activation
и общая приёмка ENG-10 в этот срез не входят.

Базовая проверка реализации принадлежит
`.ai/tools/engineering/test/directoryMove.test.ts`: source/template trees,
пустые каталоги, полная публичная проекция, финальные hashes и ACL потомков
до plan/apply. Receipt формируется явным mapper без private identity;
metadata/consumer edits заменяют исходный hash целевого файла без дублей.
Расширенная матрица находится в
`.ai/tools/engineering/test/directoryMoveFailures.test.ts`: лимит 32/33 объектов,
owner boundaries, коллизии, неподдержанная metadata, полный source/destination
ACL, изменение policy и дерева после plan, отзыв ACL между шагами, повреждение
retained original и устаревший recovery proposal. Реальный чужой `tmpfs` проверяется
в отдельном mount namespace через `directoryMount.worker.ts`.
Восемь настоящих `SIGKILL` до/после четырёх native effects проверяют reopen,
resume без повторных writes и полный receipt. Инъекции `fsync EIO` до/после
rename и при recovery проверяют отказ durability; отдельная трассировка проверяет
синхронизацию всех потомков и обоих parent. Это process-crash и syscall-fault
evidence, а не проверка отключения питания или гарантий конкретного накопителя.
Evidence текущих прогонов относится к TASK-68; техническая проверка не заменяет
пользовательскую приёмку directory slice и не закрывает весь ENG-10.
Этот directory slice принят пользователем 29 октября 2026 года; последующее
расширение §15.3 проходит отдельную контрольную точку.

### 15.3. Case-only rename

Общий Linux FS core допускает смену только ASCII-регистра basename в одном
существующем parent: например, `Original.util.ts` → `original.util.ts` при
разрешающем trusted descriptor. Из folded collision guard исключается только
точный исходный child с совпадающими kind/dev/ino и явным `move` в этом плане.
Третье совпадающее имя, Unicode/NFKC alias, занятая цель и коллизии с другими
запланированными paths остаются отказами. Для create такого исключения нет.

Целевой путь должен фактически отсутствовать. Если оба написания разрешаются
в одну identity, filesystem case-insensitive/casefold alias получает
`UNSUPPORTED` до записи. Перенос через временное имя не добавлен. Поддержанный
путь использует прежний `renameat2(RENAME_NOREPLACE)` с проверкой source identity;
exact manifest, ACL, fsync и recovery остаются теми же. Это поддержка конкретного
case-sensitive namespace, а не обещание для любой файловой системы Linux.

Project binding не ослабляет naming/metadata validators. Для дерева исходников
поддержано исправление `src/Legacy` → `src/legacy`, когда новая папка соответствует
kebab-case, оба пути принадлежат тому же owner и complete reference roots
остаются неизменными. Metadata всех файлов и поддержанные literal references
обновляются в общем frozen плане. Лимиты, receipt и запрет дополнительных actions
для directory move сохраняются из §15.2.

Project resolver сохраняет точное basename и имя функции `source.util`, поэтому
case-only rename такого файла остаётся неподдержанным. У `ai.template` uppercase purpose folder
невалиден уже на исходной стороне: его исправление требует отдельного legacy
resolver, которого этот срез не добавляет. Core file support не означает обход
этих проектных ограничений.

Адресные проверки: `packages/engineering-runtime/test/filesystemMove.test.ts`
проверяет native file rename и recovery; `caseRenameNamespace.test.ts` — границы
исключения, включая синтетический case-insensitive alias. Project scenarios в
`directoryMove.test.ts` проверяют полный результат и naming/ACL отказы;
`caseOnlyDirectoryMove.test.ts` — коллизии, drift, owner, отзыв ACL, восемь настоящих
SIGKILL, fsync EIO и recovery в одном parent. Реальная case-insensitive filesystem
и отключение питания этой матрицей не моделируются. Текущие результаты с версиями
входов принадлежат TASK-68. Переход пользователя к TASK-93 подтверждает приёмку
ENG-10 в этих границах; клиентская активация и установленная приёмка остаются
отдельными этапами.

## 16. Первый срез ENG-11: план TASK-93

Статус: **план и первый срез приняты пользователем**,
29 октября 2026 года. Полная TASK-94 не завершена. Текущая/целевая поддержка и границы клиентов
сведены в [матрице артефактов](engineering-artifacts.md#9-матрица-инженерных-изменений-eng-11).
Это первый внутренний срез TASK-94; расширение относительных extends описано в
[§17](#17-относительная-цепочка-tsconfig-extends-task-94).
Остальные требования карточки сохраняются.

### 16.1. Результат и ограничение первого среза

Поддержан перенос существующего `source.util` с однозначным
wildcard alias из одного эффективного `tsconfig.json`: `baseUrl` и один `*`
в ключе/target `paths`, один target в выбранном mapping, одна доказанная цель
внутри complete host roots.
Файл сохраняет basename/имя функции; конфигурация и public entrypoints не
переписываются. Alias сохраняется, если из прежнего mapping получается ровно
один specifier для нового пути. Неоднозначная обратная подстановка отклоняется.
Metadata и все затронутые relative/alias consumers входят в один frozen plan.

Изменение exact alias/config, workspace exports,
дополнительные source profiles и CommonJS forms остаются последующими срезами
TASK-94; их существующее поисковое чтение сохраняется. Semantic rename,
Markdown/registries и computed contexts принадлежат TASK-95–99. Расширение
read support не включает новые write cases автоматически.

Положительный пример ниже задаёт ожидаемое поведение, а не выполненную demo.
Host fixture содержит только разрешённые utility-файлы внутри `src` и
существующий parent назначения. Root config — read dependency с отдельным
read допуском, не переносимый authored artifact.

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": { "@app/*": ["src/*"] }
  }
}
```

```diff
src/math/calculateTotal.util.ts -> src/pricing/calculateTotal.util.ts

// src/useTotal.util.ts
-import { calculateTotal } from "@app/math/calculateTotal.util";
+import { calculateTotal } from "@app/pricing/calculateTotal.util";
```

До apply preview должен показать move, native metadata edit и consumer edit,
их причины/исходные и итоговые hashes; записей на preview нет. После apply
функция и её публичное имя сохранены, alias разрешается в новый файл, receipt
совпадает с filesystem. Исходник/consumer проходят действующие profile guards.

### 16.2. Один resolver и проверяемые входы

Общий analysis owner — `.ai/tools/agent-search`. Async `resolveModulePath` и
синхронный `resolveModulePathSync` выполняют один алгоритм; `runImportReadSteps`
соединяет его с I/O. Синхронный reader не принимает Promise. Config interpretation,
кандидаты и `selectModulePattern` общие; `findModuleAliasSpecifiers` вычисляет
обратные mappings. Поисковый navigation сохраняет порядок первого кандидата;
mutation policy `relocation` требует однозначности и запрещает несколько bases,
нестандартные moduleSuffixes и fallback target arrays. Поддержка exact alias и
ограниченного config effect добавлена в §19.
Линейная относительная цепочка extends допускается в границах §17.

`createSourceMoveResolver` подключает закрытый inventory и виртуальные final paths
к общему resolver. Отдельного обхода репозитория, CLI subprocess, постоянного индекса
или parser внутри rewrite нет. Один source разбирается для текстовых edits;
bytes/config и отрицательные чтения переиспользуются в пределах операции.
Config grant не переносится на source; неизвестные файлы внутри host roots
по-прежнему блокируют весь move, включая config, если он попал в source inventory.

Manifest сохраняет прочитанные config и negative probes ближайших конфигураций;
полный inventory фиксирует directory namespaces и отсутствие source candidates.
Появление nearer config, нового кандидата или изменение bytes после preview
инвалидируют план. Отрицательный probe фиксируется также до финального snapshot:
появившийся при планировании config не подменяет прочитанную версию.
`LocalFilesystemOptions.canReadReference` — дополнительный синхронный read grant
trusted host. При ограниченном доступе host подключает его явно; отказ проверяется
до чтения dependency и при каждом snapshot/apply/recovery. Config не получает
write effect. Отзыв read grant выдаёт `FORBIDDEN` без сообщения внешнего adapter.

В read manifest входят effective config и источники policies/resolver;
после переноса повторно проверяется resolution в финальном виртуальном дереве.
Файл назначения, consumers и read-only config имеют соответствующие допуски.
Уже существующие journal, ACL, exact-version guards и recovery исполняют effects.

### 16.3. Область реализации

| Владелец                                                                                                             | Изменение                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| agent-search: resolveModulePath, loadImportConfiguration, createImportReadContext и их типы                          | Общий resolution для двух adapters, bounded footprint/cache; сохранение поиска aliases/workspaces и его diagnostics.               |
| engineering: ProjectArtifactMove.types, projectArtifactProfiles, prepareProjectArtifactRelocation, rewriteSourceMove | Передача immutable resolution context, alias specifier edit, финальная проверка целей, включение новых read dependencies.          |
| engineering-runtime: ArtifactDescriptorPort / manifest preparation                                                   | Учёт отсутствующих read dependencies и fresh host read grant при snapshot; native primitives, journal и формат операции сохранены. |
| Existing tests и прямые документы                                                                                    | Положительные/отрицательные сценарии среза, regression потребителей общего поиска, актуализация матрицы по результату.             |

Непосредственные исходники:
[resolver](../../.ai/tools/agent-search/src/resolveModulePath.service.mjs),
[read context](../../.ai/tools/agent-search/src/createImportReadContext.service.mjs),
[relocation](../../.ai/tools/engineering/src/prepareProjectArtifactRelocation.service.ts),
[rewrite](../../.ai/tools/engineering/src/rewriteSourceMove.util.ts),
[descriptor port](../../packages/engineering-runtime/src/artifacts/ArtifactDescriptor.types.ts).
Полноценное подключение CLI/MCP/Admin остаётся в TASK-79/80/81. Рекомендация
аудита о более раннем минимальном клиенте требует решения о порядке поставок;
TASK-93 не меняет согласованную последовательность автоматически.

### 16.4. Проверки, расходы и контрольная точка

1. Сначала адресные shared-resolution tests: wildcard match/inversion,
   relative compatibility, неединственная цель, cycle/неподдержанная config,
   denied read и budgets. Existing aliases/extends/workspaces поискового
   потребителя сохраняют результат. Один файл в неизменном context не читается
   повторно без основания.
2. Native project fixture: ожидаемый preview/apply/receipt, исходный отказ
   bare alias заменён положительным случаем только в новой границе. Проверить
   collision, чужой owner, ACL consumer/config, source/config/namespace drift,
   повтор apply, SIGKILL после move/metadata/consumer effects и recovery.
3. До тяжёлой приёмки: TypeScript обоих владельцев и ES2018 consumer, адресные
   lint с явным включением `.ai`, headers, format и doc links. Transitive imports
   acceptance snapshot должны присутствовать до production build.
4. На итоговых неизменных входах — существующий `check:search:isolated`, поскольку
   меняется общий resolver и его реальные потребители. После успешного запуска
   повторять только при изменении inputs или непокрытом риске. Installed
   acceptance требует реальной сборки/consumer evidence и не подменяется fixture.

Используется существующий verification runtime: явные команды/inputs,
source-bound receipts и reuse неизменённых проверок. Бюджет первого плана:
до 60 s на быстрый check, до 180 s на выбранную native группу; изолированный gate
использует свой штатный timeout. Это предел команды, не обещание общей длительности.
Обязательная проверка не пропускается ради бюджета; превышение требует объяснения
и корректировки плана. Новая модель для технических операций не запускается.
Сохраняются фактические duration/bytes/read count/executed/reused и причины
повторов; недоступные токены/стоимость/остаток подписки остаются unknown.

План TASK-93 принят пользователем 29 октября. Первый срез TASK-94 проверяется
через `moduleRelocation.test.mjs`, `sourceMoveResolver.test.ts` и native
`aliasMove.test.ts`, включая три точки SIGKILL и повторный read ACL при recovery.
Итоговые source-bound receipts и конкретные preview/apply/receipt предъявляются
в карточке TASK-94 для промежуточной приёмки. Последующие source profiles,
workspaces/config edits и installed/client acceptance остаются отдельным
остатком; успешный fixture не принимает их автоматически.

## 17. Относительная цепочка tsconfig extends: TASK-94

Второй внутренний срез расширяет принятый wildcard move `source.util` на линейную
цепочку относительных `extends`. Загружается не более восьми конфигураций,
включая ближайшую. Строка и массив с одним relative base задают ту же цепочку;
несколько bases на любом уровне отклоняются для relocation. Package/absolute
extends, выход за workspace, новые source profiles и изменение config не входят
в этот срез. `baseUrl` и `paths` наследуются либо переопределяются согласно
происхождению options; допустимы уже поддержанные JSONC/BOM и implicit `.json`.
Каждый source target по-прежнему должен быть единственным и разрешённым.

Владелец чтения — существующий `loadImportConfiguration` в agent-search. Metadata
эффективной конфигурации сохраняет длину самой длинной цепочки и наличие нескольких
bases в любом ancestor. Проверка глубины выполняется также на cache hit: ранее
прогретая восьмиэлементная base могла ошибочно разрешить девятый config. Исправление
действует для sync и async callers; отдельного loader в engineering не добавлено.
Навигация сохраняет своё чтение нескольких bases и порядок кандидатов.

Вся цепочка читается через прежние bounds, grants и cache. Manifest project move
сохраняет её read dependencies вместе с negative probes. Изменение/удаление base,
смена extends edge, появление nearer config или отзыв read ACL делают старый план
неприменимым. После начавшейся записи отзыв допуска требует recovery; resume
использует существующий frozen plan и повторную проверку. Конфигурации остаются
byte-identical и не получают write effects. Форматы journal, операций и receipt,
native primitives и engineering rewrite не изменены.

`importConfigurationInheritance.test.mjs` сравнивает resolution с установленным
TypeScript и проверяет origin/override, восемь/девять config при холодном/прогретом
cache, несколько bases, цикл, отсутствующую/запрещённую/слишком большую base.
`aliasMove.test.ts` проверяет файл и directory, preview без записей, полный receipt,
повтор apply, config drift/ACL и три точки настоящего SIGKILL для унаследованного
alias. Общие поиск/потребители проходят существующий isolated acceptance; текущие
source-bound receipts и реальный demo доступны из TASK-94. Успех этих проверок
не означает installed/client acceptance или завершение всей TASK-94.

## 18. Source profiles: третий срез TASK-94

Контракт третьего внутреннего среза, 29 октября 2026 года.
Первые два среза приняты пользователем; результаты третьего фиксируются отдельно
в TASK-94. Профили расширяют existing binding, parser/resolver и mutation runtime.

| Kind             | Поддержанный формат и имя                                                                                                                  | Формальная проверка                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| source.util      | `<function>.util.ts` / `.mjs` / `.mts` / `.cjs` / `.cts`                                                                                   | Существующий utility contract сохраняется; MJS — §26, MTS — §27; CommonJS — §28.           |
| source.service   | `<function>.service.ts` / `.js` / `.mjs` / `.mts` / `.cjs` / `.cts`                                                                        | Именованная function/arrow с camelCase именем файла.                                       |
| source.adapter   | `<function>.adapter.ts` / `.js` / `.mjs` / `.mts` / `.cjs` / `.cts` либо `<Entity>.adapter.ts` / `.js` / `.mjs` / `.mts` / `.cjs` / `.cts` | Функция с совпадающим именем либо класс `<Entity>Adapter`; роль не дублируется в basename. |
| source.component | `<Name>.component.tsx` / `.jsx`                                                                                                            | PascalCase function/arrow, source owner приложения или пакета; directives сохраняются.     |
| source.types     | `<Contract>.types.ts`                                                                                                                      | Только type/interface и type-only imports/exports; runtime declarations запрещены.         |

`source.types` нужен для вынесенных props и контрактов этих profiles. Остальные
роли, module variants, public index/native routes и generated не подключаются
автоматически. Формальные guards не доказывают чистоту функции, корректность
бизнес-логики или весь React/Next runtime contract; такие проверки остаются у
профильного typecheck/build/review и не объявляются пройденными одним parser.

Project binding единолично классифицирует существующий файл по registered profile
и проверяет содержимое/owner policy. Core использует дополнительный trusted
`ArtifactDescriptorPort.resolveExistingFile`; без него edit/move/quarantine
существующего файла отклоняются. Core не перебирает имена видов Realize. Явный kind
создания сохраняется и не может противоречить реально определённому profile.

Все действующие guards полного inventory, ACL, provenance, read manifest и recovery
сохраняются. Файл/дерево остаётся у прежнего owner и в той же effective physical
client/server boundary. Директивы `use client`/`use server` не меняются и не могут
противоречить друг другу или folder policy. Новый profile не разрешает переход
между этими областями. Сохранение identity всех module targets не является
сертификацией исходного dependency graph; неизвестная связь блокирует полный move.

Один helper agent-search сохраняет extensionless и явные TS/JS/TSX/JSX specifiers
для relative и wildcard aliases; повторный общий resolver подтверждает конечную
цель. В рамках §18 config/символы/basename не переписываются; отдельный config
effect определён в §19. Bare package imports, workspace
mappings, CSS/assets, CommonJS и вычисляемые references остаются ограничением
текущего project move. Это включает package marker imports; сами string directives
не теряются. Явные `.js`/`.jsx` и extensionless cases проверяются отдельно.

Приёмка: native перенос service и component со связанными types/consumers,
смешанное authored дерево, preview без записей, точные effects и receipt; naming,
JS grammar, type-only, ACL/owner/boundary drift и collision; повтор apply и настоящий
SIGKILL/recovery dependent edits. Прямые consumer typecheck и existing search
isolated acceptance подтверждают расширение общего helper. Source-bound receipts
переиспользуются только при неизменных inputs; installed/client acceptance остаётся
отдельной задачей.

## 19. Exact aliases и config effect: четвёртый срез TASK-94

Перенос source-файла или дерева может сохранить точный alias (`@price`) и заменить
его единственный target в `compilerOptions.paths`. Это отдельный dependent edit
существующего config в том же frozen plan, с diff, версией, ACL, receipt и recovery.
Обычные relative/wildcard consumers продолжают обновляться существующим resolver.
Exact reference на неподвижную цель допускается без записи config; перенесённая
цель требует сохранения alias identity и явно подключённого config effect.

Доверенный host задаёт `movePolicy.tsconfigWrite` с точным `path` на `tsconfig.json`
и `allConsumersInReferenceRoots: true`. Это утверждение владельца о **всех**
потребителях данного config в существующих complete `referenceRoots`, а не флаг
команды пользователя. Без такого доказанного host scope запись не включается.
Config лежит вне source inventory; для него нужна отдельная folder policy,
допускающая `config.tsconfig`, и actor write ACL. Read grant сам по себе недостаточен.

Первый config write ограничен одним документом с собственными `baseUrl` и `paths`,
без `extends`. Каждый source в inventory до/после переноса должен использовать
именно этот config. Все exact targets разрешаются общим строгим resolver в
единственные файлы внутри inventory; fallback arrays, неоднозначность и внешние
цели блокируют операцию. Редактируются только targets, указывающие на переносимые
файлы, включая неиспользуемые сейчас aliases. Все exact mappings проверяются
повторно в виртуальном результате. Wildcard mappings остаются неизменными;
если их прежний контракт не позволяет корректный specifier, move отклоняется.

`agent-search` владеет exact/wildcard selection и разрешением модуля. Engineering
использует AST только для offsets JSONC patch и прежний `applyArtifactTextEdits`:
BOM, CRLF, comments и остальные настройки сохраняются. Дубли ключей root,
`compilerOptions` или `paths`, несовпадающая исходная строка и неподдержанный
native формат отклоняются. Alias key и символы исходника не переименовываются.

Native profile config разрешён только для dependent edit. Descriptor port
получает `purpose: dependent_edit` от runtime при проверке исходного consumer;
обычные create/edit/move/quarantine не получают этот допуск. Это уточнение
внутреннего trusted port, не новое поле пользовательского DTO. Core сохраняет
общие effects/journal и не знает проектных kind names. Изменение config policy,
source/consumer/config, появления nearer config или отзыв ACL делают план stale
либо запрещают его применение, в том числе после перезапуска.

Чтение линейной relative extends цепочки из §17 сохраняется. Запись одного
унаследованного owner расширена в §20. Запись нескольких config,
package/workspace mappings, wildcard mapping effects,
изменение public entrypoints и подключение клиентов остаются отдельными этапами.
Эта поставка не означает общую приёмку TASK-94.

Приёмка включает file/directory move с сохранением exact aliases, отдельные config
diff/receipt, проверку TypeScript consumer, negative cases полноты/дубликатов/ACL/
drift, запрет прямых config actions, retry и SIGKILL/recovery всех dependent edits.
Перед handoff нужны свежие source-bound checks и одна isolated search acceptance.

## 20. Exact paths из relative extends: пятый срез TASK-94

Контракт §19 расширяется на один изменяемый документ в линейной цепочке relative
`extends` до восьми config. Shared loader `agent-search` возвращает
`settings.pathsSourcePath` и `settings.baseUrlSourcePath`: точные repo-relative
пути документов, объявивших эффективные options. Наследование и cache сохраняют
origin; child override заменяет origin соответствующей option. Engineering не
обходит цепочку и не реализует собственное разрешение config.

`tsconfigWrite.path` — точный `.json` документ вне source inventory, объявивший
эффективный `paths`. Его имя может отличаться от `tsconfig.json`; native profile
и folder policy остаются обязательными. `allConsumersInReferenceRoots: true`
подтверждает **всех**, включая транзитивных, consumers этого owner. У каждого
исходного и будущего source path в complete inventory должны совпасть ближайший
consumer `tsconfig.json` и origin `paths`. Несколько nearest configs, несколько
bases на любом уровне, package extends, циклы, пропущенные config и другой
paths owner блокируют план. Эта проверка не заменяет полноту host inventory.

`baseUrl` может быть унаследован или переопределён дочерним config. Target string
вычисляется относительно **эффективного** `baseUrl`, определённого shared loader,
а не каталога редактируемого документа. Owner обязан содержать собственный
`compilerOptions.paths`; собственный `baseUrl` не обязателен. Локальный AST patch
проверяет однозначность изменяемого JSONC и offsets строк; он не разрешает
наследование. Остальные правила exact targets, identity, extension style,
неиспользуемых aliases и финального resolution из §19 сохраняются.

Preview показывает один dependent edit paths owner. Прочие документы цепочки
остаются read dependencies: bytes, edges `extends`, source origins и negative
nearer probes участвуют в frozen snapshot. Для чтения нужен ACL всей цепочки;
write grant требуется только изменяемому owner и прежним source effects.
Read-only ancestors не получают скрытых write effects. Runtime и его общий
журнал, admission, retry и recovery используются без отдельного config writer.

Приёмка проверяет собственный config и inherited owner одинаковым набором
file/directory, ACL, drift, retry и настоящих SIGKILL/recovery сценариев. Отдельно
проверяются child `baseUrl` override по установленному TypeScript, неверный owner,
второй consumer config, смена extends edge и сохранность прочих config bytes.
Shared-loader tests подтверждают provenance при overrides и warm cache.
Перед handoff — актуальные source-bound checks и isolated search acceptance.
Несколько consumer configs одного owner расширены в §21. Несколько owners,
wildcard config effects и workspace/package контракты остаются следующими
этапами; данный срез не завершает TASK-94.

## 21. Несколько consumer configs общего paths owner: шестой срез TASK-94

Один `tsconfigWrite.path` может обслуживать несколько nearest consumer configs.
Каждый original и final source path из complete inventory разрешается общим
loader; origin `paths` должен совпадать с явно разрешённым owner. Все effective
`baseUrl` должны указывать на одно нормализованное repo-relative основание:
разные относительные написания допустимы, разные физические основания дают
`UNSUPPORTED` до записи. Каждая цепочка остаётся линейной, не длиннее восьми
config. Несколько bases на одном уровне и package extends не разрешены.

Engineering группирует позиции consumers по nearest config и сохраняет union
контекстов до и после move. Одинаковый config проверяется один раз, общие bytes
и negative probes читаются через существующий cache. Все exact mappings,
включая неиспользуемые aliases, разрешаются в каждом distinct config через
`agent-search`: исходная физическая цель должна быть единственной, общей для
всех контекстов и входить в inventory. Target edit вычисляется один раз и
проверяется повторно из каждого контекста в виртуальном результате. Перенос
между configs сохраняет проверки прежнего и будущего контекстов.

Полноту **всех**, включая транзитивных, consumers общего owner подтверждает host
через прежние complete `referenceRoots` и `allConsumersInReferenceRoots`.
Совпадение обнаруженных imports не доказывает эту полноту. Все config остаются
вне source inventory; roots могут охватывать отдельные source-каталоги нескольких
consumers. Ограничения reader по files/bytes/probes и inventory сохраняются;
новый обход репозитория и отдельный resolver не добавляются.

Этот контракт использует nearest config как модель consumer context. Host может
подтвердить полноту только если все активные контексты представлены этой моделью.
Альтернативный `tsc --project` config, который собирает те же файлы и не является
их nearest config, автоматически не обнаруживается; такой контур требует
явного project-config контракта §22 до включения shared write.

Frozen plan содержит один dependent edit JSONC owner и прежние source effects.
Остальные configs не изменяются и требуют только read ACL. Snapshot включает
каждую ветвь, owners, consumers, source namespaces и negative nearer probes:
смена непримарного config, новая ветвь/consumer, drift policy или отзыв ACL
блокируют применение либо требуют штатного recovery. Прямые config actions и
перенос через несовместимые source owner boundaries по-прежнему запрещены.

Приёмка: file/directory move между configs с несколькими consumers, одинаковым
нормализованным `baseUrl` при разных написаниях и TypeScript oracle каждого
consumer; один config diff, preview без записей, receipt/hashes и retry.
Отрицательные сценарии включают несовместимый `baseUrl`, иной paths owner,
неподдержанные options только во вторичном config, ACL/drift/nearer/inventory
вторичной ветви, неиспользуемые mappings и SIGKILL/recovery. Single-config
сценарии сохраняются. Свежие receipts неизменённых общих consumers, включая
isolated search gate, переиспользуются после проверки их inputs; изменившиеся
входы требуют соответствующего прогона. Несколько paths owners, разные
физические `baseUrl`, wildcard config effects и workspace/package mappings
остаются отдельными этапами. Этот срез не завершает TASK-94.

## 22. Явные project configs: седьмой срез TASK-94

Доверенный `tsconfigWrite.projectConfigPaths?: readonly string[]` дополняет
nearest contexts полным списком активных non-nearest конфигураций `tsc --project`.
Если список задан, он содержит от 1 до 16 уникальных точных repo-relative `.json`
путей вне source inventory. Отсутствие списка сохраняет nearest-only контракт:
host вправе применять его только при отсутствии других активных контекстов.
`allConsumersInReferenceRoots` подтверждает полноту **и конфигураций, и всех
транзитивных consumers**. Поиск config по всему репозиторию, угадывание CI scripts
и скрытые CLI overrides не заменяют эту host policy.

Общие `loadImportConfiguration[Sync]` и `resolveModulePath[Sync]` принимают
необязательный exact `configPath`. Выбор явного config не запускает nearest
fallback; cache, ACL, глубина и provenance принадлежат прежнему loader.
Engineering объединяет nearest и явные контексты. Все они должны иметь одного
`pathsSourcePath`, одинаковый нормализованный `baseUrl` и линейные relative
extends. Неиспользуемые exact mappings также проверяются в каждом контексте.
Для каждого source reference все контексты обязаны подтвердить одну исходную
цель, одно новое написание и одну ожидаемую цель после move.

Явные configs консервативно применяются ко **всему** закрытому inventory, включая
файлы вне их root selectors: `exclude` не исключает транзитивный import из
программы TypeScript. Это намеренная верхняя оценка потребителей; несовместимые
настройки даже неиспользуемой ветви могут дать безопасный отказ. Узкая маршрутизация
по графу конкретной программы этим срезом не заявляется.

Общий `loadImportProjectFilesSync` в `agent-search` вычисляет root files каждого
явного проекта до и после move по native TypeScript `files/include/exclude`,
включая наследование и overrides. Он использует только переданный закрытый
inventory и bounded config reader; не читает host FS и ничего не пишет.
`getParsedCommandLineOfConfigFile` и runtime export `matchFiles` установленного
TypeScript заменяют самостоятельный parser/glob. `matchFiles` не входит в
публичные декларации TypeScript: отсутствие export даёт fail-closed; обновление
TypeScript требует oracle на настоящем `tsc --project` и selector tests.

Root set после move должен точно равняться прежнему root set с отображением
перемещённых путей. Потеря/добавление root, отсутствующий literal `files` entry,
путь вне inventory, неверный config, пустой проект, project references и
несовместимые options блокируют план до записи. Сами `files/include/exclude`
не переписываются. Это проверка сохранения entrypoints, не полная компиляция
проекта и не разрешение project references/build mode. Полноту внешней области
по-прежнему подтверждает host; closed inventory не обнаруживает скрытые файлы.

Все config bytes/extends и catalog policy входят в прежний read manifest;
virtual final config использует единственный разрешённый owner effect. Остальные
config сохраняют bytes и требуют только чтения. Drift, удаление config, изменение
policy, новая source entry и отзыв read ACL блокируют apply/recovery через
существующие механизмы. Отдельного writer, runtime или DTO не добавляется.

Приёмка включает file/directory move, два non-nearest проекта, compiler oracle,
сохранность selectors/configs, preview без записи, receipt, retry и actual
SIGKILL/recovery; отрицательные selectors, baseUrl/owner/options, ACL и drift.
Общий search проходит isolated gate после изменения его исходников. Неизменённые
checks переиспользуются только при актуальных inputs. Automatic project discovery,
project references/build mode, CLI overrides, selector rewrites, несколько
owners/bases, wildcard config effects и workspace/package mappings остаются
за пределами среза; TASK-94 не считается завершённой.

## 23. Перенос wildcard target-каталога: восьмой срез TASK-94

Прежняя `tsconfigWrite` policy допускает dependent edit wildcard mapping, если
перемещается **весь** его статический target root: один target `directory/*`,
один завершающий `*` в alias key. Root должен совпасть с переносимым каталогом
либо находиться внутри него и содержать поддержанные source members из complete
inventory. Например, `@domain/* → ./src/domain/*` при move
`src/domain → src/pricing/domain` сохраняет key `@domain/*` и получает target
`./src/pricing/domain/*`. Вложенные и неиспользуемые mappings обновляются тем же
способом. Несколько изменяемых exact/wildcard targets одного owner входят в один
JSONC effect; второй config writer не создаётся.

File move и перенос части target root не меняют широкий wildcard mapping:
прежний inverse mapping пересчитывает references. Так, `@app/* → src/*` остаётся
неизменным при переносе `src/domain`; фактический `@app/domain/...` пересчитывается
в новый путь. Для mapping с перемещённым root исходные specifiers сохраняются
только после проверки физической цели в виртуальном результате каждого context.
В плане с wildcard config effect, если на одну цель указывают несколько aliases, для пересчитываемого wildcard
reference сначала выбирается его прежний pattern, когда он остаётся применим
в final config и не затенён более приоритетной привязкой. Если он больше не
покрывает цель, действует прежнее требование единственного обратного mapping.
Выбор кандидата не заменяет итоговую проверку resolution.

Engineering выбирает affected roots, но не реализует module resolution.
`findModuleAliasSpecifiers`, `selectModulePattern` и `resolveModulePathSync` из
`agent-search` строят и проверяют proof specifiers каждого member: extensionless,
явное native расширение и соответствующий JS/JSX стиль. Проверяются также
неиспользуемые wildcard mappings. Exact priority и более специфичные mappings
сохраняются: затенённый specifier проверяет его фактический владелец; неиспользуемое
неоднозначное достижимое имя блокирует plan. Все proof targets проверяются во всех
original/final nearest и явных project contexts до и после config effect.
Лимит proof specifiers — прежний `IMPORT_RESOLUTION_LIMITS.graphEntries` (2048),
read/file/probe budgets остаются общими. Полноту inventory и active contexts
по-прежнему подтверждает host, а не набор найденных imports.

Если изменяемый static root использует fallback targets, suffix после `*`,
несколько wildcard, constant target для wildcard key, пустой/неподтверждённый
каталог или иную неподдержанную форму, операция отказывает до записи. Настройки
не превращаются в более широкие mappings автоматически. Поддержка общего
read-only resolver не означает допустимость config effect произвольной формы.
Source profiles, owner boundaries и запрет прямых config actions сохраняются.

Требуются один paths owner, одинаковый нормализованный `baseUrl`, linear relative
extends и complete host roots. Explicit projects продолжают проверять root
membership по §22; selectors и project config bytes не переписываются. JSONC patch
меняет только значения targets, сохраняя keys, BOM, comments, CRLF и прочие
options. Prefix `./` сохраняется; физические пути вычисляются относительно
эффективного `baseUrl`, включая унаследованный owner.

Preview, read/write ACL, source/config/policy drift, namespace snapshots,
collisions, receipt всех потомков и recovery принадлежат существующим
engineering binding/runtime. Проверки включают real directory move с вложенными
roots, own/inherited owner, несколько nearest configs и explicit projects,
compiler oracle, broad/overlapping mappings, ambiguity, ACL/drift и actual
SIGKILL до/после config effect. Новые изменения общего resolver не требуются,
если существующие primitives доказывают контракт; актуальные receipts его
неизменённых inputs переиспользуются после `status`.

Срез не завершает TASK-94. Произвольные wildcard target shapes, несколько owners,
project references/build mode, workspace/package mappings, CLI overrides,
дополнительные module variants и CommonJS остаются отдельными требованиями.

## 24. Точные workspace exports: девятый срез TASK-94

Контракт ограничивает перенос файла или дерева пределами одного workspace
package. Host задаёт `packageExportsWrite`: точный `path` его `package.json`,
непустые `workspaceRoots` и `allConsumersInReferenceRoots: true`. Source inventory
должен включать все export targets изменяемого owner и всех транзитивных consumers.
Root `package.json` и manifests не входят в source roots. Перенос между packages,
совместный `tsconfigWrite` и изменение package name/subpath не разрешаются.

Workspace catalog использует shallow namespace port по §25; source inventory
перечисляет только `referenceRoots`. Поддерживаются прежние literal и terminal
`/*` workspace declarations. Прочитанные namespaces и manifests входят в frozen
manifest; их изменение после preview инвалидирует снимок. Сохраняются лимиты
source inventory: 16 roots, 128 files/directories, глубина 16; нет молчаливого
усечения или обхода ACL.

Общий `agent-search` предоставляет отдельную opt-in policy `relocation-exports`.
Прежняя `relocation` по-прежнему отклоняет bare package references. Новая policy
использует тот же каталог, parser/config cache и unique-target resolution.
Она принимает `exports` string для `.` либо непустую плоскую map точных
`.`/`./subpath` со строковыми canonical `./` targets и явным source/JS расширением.
Conditional objects, wildcard, arrays, null, legacy/no-exports fallback,
CommonJS и `#imports` остаются неподдержанными. Если `baseUrl` может затенить
package, включая невозможность проверить отсутствие цели, операция блокируется.
Existing paths aliases проходят прежние проверки; config effect для них этот
срез не добавляет.

Engineering проверяет каждый export owner, включая unused, во всех original/final
nearest configs. Общий resolver должен подтвердить единственную исходную цель
из inventory и её ожидаемый путь после move. Имена импорта у соседнего workspace
и self references сохраняются только после повторной проверки цели. Targets
с JS-расширением сохраняют стиль через общий `styleModuleTarget`; directory/index
fallback не применяется к exports. Package и source owners остаются прежними.

Один dependent `config.package-exports` effect меняет только строковые targets
через AST offsets и общий text patch. JSON остаётся строгим JSON; BOM, CRLF,
отступы, остальные свойства и package version сохраняются. Дублирующиеся ключи
owner отклоняются. Native config descriptor и AST property reader переиспользуются
с tsconfig; прямые create/edit/move/remove package manifest этим профилем запрещены.
Writer, journal, ACL, receipt и frozen recovery остаются у `engineering-runtime`.

Приёмка требует реальных file/directory moves, literal/glob workspace catalog,
root/subpath exports, нескольких nearest contexts, compiler oracle и неизменных
package consumers при закрытом write ACL. Проверяются ambiguity, unsupported
forms, unknown/outside source coverage, collision, denied read/write, drift
source/manifest/workspace namespace/policy, retry и SIGKILL/resume до/после config
effect. Изменения общего поиска требуют checks его непосредственных потребителей
и актуального isolated gate; это не installed/client acceptance.

Срез не завершает TASK-94. Conditional/wildcard package mappings, package imports,
project references/build mode, несколько изменяемых owners, дополнительные
source/module variants и CommonJS остаются отдельными требованиями.

## 25. Каталог workspace без рекурсивного source scan: TASK-94

`ArtifactInventoryPort.directories(path, maximumEntries)` — optional host port
для непосредственных подкаталогов одного namespace. Он возвращает полные
относительные пути, пустой массив для пустого каталога и `null` для отсутствующего
пути. Для `packageExportsWrite` port обязателен, включая literal declarations;
старые bindings без package effect сохраняют прежний `files` contract.
Engineering ограничивает вызов `workspaceRoots` и передаёт результат общему
`agent-search`. Синтаксис workspaces, чтение manifests, duplicate package names,
cache и budgets по-прежнему принадлежат общему resolver; второго scanner нет.

Native port использует тот же `DescriptorFilesystem.entry` и private namespace
manifest, что и рекурсивный source inventory. Повторные запросы в одном плане
переиспользуют прочитанный namespace; перед staging он сверяется с filesystem.
Read ACL проверяется до чтения namespace и для возвращаемых каталогов; snapshot,
apply и recovery повторяют ACL по сохранённым путям. Проверки no-follow,
filesystem/identity/mode, пустых и отсутствующих каталогов сохраняются. Нет
обхода потомков, чтения source bytes или отдельного writer. Лимит вызова bounded
native port — 1–4096 namespace entries; resolver передаёт свой лимит 256.
Превышение даёт явный отказ, без частичного результата. Общие лимиты references,
manifest и bytes не повышаются.

`referenceRoots` независимо задаёт полный ограниченный source inventory для
переноса. `allConsumersInReferenceRoots: true` — обязательство trusted host о
всех прямых и транзитивных потребителях, а не результат обнаружения каталогом.
Несвязанные workspace sources вне этих roots не перечисляются и не читаются;
ссылка или export target вне разрешённой области не принимается за отсутствующий
файл. Отсутствие неизвестных consumers во всём monorepo не доказывается.
Каждый export изменяемого owner, включая unused, должен иметь единственную цель
в source inventory. Текущий срез не предоставляет автоматический selector
полноты consumers и не заявляет готовность произвольного переноса всего monorepo.

Nested package boundary проверяется адресными `package.json` probes на предках
исходного и конечного пути внутри owner. Положительный probe блокирует перенос;
отрицательный сохраняется в frozen manifest. Manifest внутри перемещаемого дерева
также не становится authored source. Добавленный package/manifest в прочитанном
namespace или новый boundary после preview требуют нового плана. Изменение
содержимого несвязанного source вне доказанной области само по себе не является
изменением каталога и не инвалидирует план.

Приёмка: file/directory move с большим несвязанным sibling (>128 source files),
счётчиками фактического чтения, preview/receipt/compiler/retry; empty, literal/glob,
missing manifest, duplicates, budget, symlink, ACL и positive/negative drift.
Прежние native regressions и frozen SIGKILL recovery сохраняются. Общий поисковый
движок не меняется; его полная изолированная приёмка не повторяется только из-за
этого adapter change. Изменение самого search engine потребует его профильных gates.

## 26. ESM profiles `.mjs`: одиннадцатый срез TASK-94

Существующие `source.util`, `source.service` и `source.adapter` принимают `.mjs`.
Расширение принадлежит регистрации profiles; naming, главный символ, шапка,
authored provenance, allowedKinds, owner и execution boundary сохраняются.
Общая регистрация применяется существующими native create/edit/move guards;
нового генератора или механизма записи нет. Остальные форматы этих profiles
сохраняются; `.mts/.cts/.cjs`, MJS components/types и дополнительные роли этим
срезом не подключаются.

MJS проходит существующие JavaScript grammar checks, общий syntax parser,
извлечение module references и unique-target resolution. TypeScript-only syntax
не становится допустимым после смены расширения. Формальная проверка source
не доказывает всю семантику JavaScript или работоспособность приложения.
Для native Node ESM сценария проверяются явные `.mjs` относительные specifiers,
incoming/outgoing imports, re-export и literal `import()`. Extensionless ссылка
на единственный MJS-файл не получает новый fallback. CommonJS `require`, computed
paths, неизвестные/внешние и неоднозначные цели сохраняют прежние отказы.

Проверяемый project config использует `moduleResolution: bundler`. Общий loader
по-прежнему допускает только явно заданные `bundler`, `node` и `node10`;
`NodeNext`/`Node16` отклоняются как `unsupported_configuration`. Реальное исполнение
явных MJS imports в Node не означает поддержку этих режимов TypeScript resolver.

Перенос сохраняет basename и имя основного символа. Общий `styleModuleTarget`
сохраняет расширение specifier; resolver повторно подтверждает ожидаемую цель.
JSONC aliases и exact package exports используют прежние host contracts и
config effects. `paths` aliases остаются контрактом настроенного compiler/loader,
а не обещанием исполнения bare alias обычным Node. MJS package targets проверяются
на реальных workspace links. Условные/wildcard exports и дополнительные package
mapping forms остаются вне среза.

Preview, read/write ACL, frozen source/config/namespace snapshots, native writer,
receipt, retry и recovery не меняются. Область `referenceRoots` остаётся полной
и ограниченной по прежнему контракту; profile registration не создаёт автоматический
поиск всех consumers. Для UI, CLI/IDE и MCP write actions нужны их отдельные задачи.

Приёмка включает native file/directory moves util/service/adapter (функция/класс),
исполнение изолированного ESM graph в закреплённом Node до/после переноса и
TypeScript `checkJs`. `.mjs` сохраняет ESM-поведение рядом с `type: commonjs`.
Проверяются BOM/CRLF, полный preview/receipt, aliases/workspace exports, invalid
grammar/naming/format, collisions, ACL/owner/boundary, drift и настоящий
SIGKILL/resume. Production исходники проекта для этой проверки не исполняются.
Общий поисковый движок не изменяется при одной регистрации profile; его отдельные
gates подключаются при фактическом изменении соответствующего owner.

## 27. TypeScript ESM profiles `.mts`: двенадцатый срез TASK-94

Регистрация `source.util`, `source.service` и `source.adapter` включает `.mts`.
Это TypeScript grammar с прежними naming, authored provenance, owner и execution
boundary guards. MTS components/types и declaration profiles, `.cts/.cjs` и
CommonJS этим срезом не подключаются. Регистрация общая для create/edit/move;
новых parser, resolver, генератора или writer нет.

Общий resolver уже различает source `.mts` и явный runtime specifier `.mjs`.
Перенос сохраняет extension style, basename и основной символ, перепроверяет
единственную цель входящих/исходящих imports, re-export, type references и literal
`import()`. `.mts` рядом с одноимённым `.mjs` остаётся неоднозначностью для mutation;
extensionless ссылки на MTS не получают нового fallback. Emitted companions
не следует помещать в объявленный authored source inventory.

Проверяемый compiler config — `moduleResolution: bundler`. До/после file/tree move
реальный TypeScript компилирует изолированный MTS graph с `.mjs` specifiers;
полученный ESM graph исполняется в Node с одинаковым результатом. Output находится
во внешнем временном каталоге и удаляется после проверки; исходники и package/config
не подменяются compiler output. Явные `.mts` specifiers требуют соответствующих
compiler options и не обещаются исполняемыми обычным Node после обычного emit.
`NodeNext`/`Node16` сохраняют прежний отказ loader.

Aliases и exact workspace exports переиспользуют прежний resolver и native config
effects; их MTS source resolution проверяется установленным TypeScript. Aliases
требуют настроенного loader для runtime. Conditional/wildcard package mappings,
multiple owners и project references не подключаются. Полноту ограниченного
`referenceRoots` по-прежнему гарантирует trusted host.

Приёмка включает preview без live writes, полный receipt/hash, retry, ACL,
collisions/ambiguity, drift и настоящий SIGKILL/resume; MJS regressions выполняются
на общей ESM fixture. Формальная syntax validation не заменяет typecheck,
исполнение приложения и оценку чистоты/качества исходников.

## 28. CommonJS profiles `.cjs/.cts`: тринадцатый срез TASK-94

`source.util`, `source.service` и `source.adapter` принимают `.cjs` и `.cts`
с прежними naming, главным символом, owner, authored provenance и execution
boundary. CJS — JavaScript CommonJS без статических ESM declarations; CTS —
TypeScript CommonJS, включая `import = require`, static imports/exports и emit.
`import.meta` не входит в эти CommonJS profiles. Component/types/declaration
profiles и автоматическое определение CommonJS для обычных `.js/.ts` по package
type не подключаются.

Engineering переиспользует общий AST extractor и передаёт `import`/`require` mode
существующему resolver до/после изменения. Для CJS literal `import()` сохраняет
import mode, CTS references проверяются в require mode согласно CommonJS emit.
Поддержан прямой `require("literal")` с одним аргументом; property/indirect,
optional, computed/template и multiargument forms отклоняются. Для CTS также
допускается literal `import name = require("literal")`.

Чтобы не переписывать локальную функцию с именем `require`, mutation policy
отклоняет CommonJS source, если identifier `require` используется иначе, чем
callee прямого вызова. Это консервативный синтаксический guard: он запрещает
declarations/parameters/aliases/assignments/property usages, включая безвредные
одноимённые identifiers; полноценный semantic binding этим не реализован.
`with` и любой identifier `eval` также отклоняются: динамическая область может
подменить прямой `require`. Это включает некоторые безопасные usages `eval`.
Существующие ESM/обычные TS/JS profiles сохраняют прежний отказ require/import-equals.

Область — относительные ссылки и существующие `paths` aliases. `node:` builtins
сохраняются без rewrite. Basename и основной символ не меняются; quotes,
metadata, BOM/CRLF сохраняются прежним patch. Literal `.cjs` specifier может
разрешаться в единственный `.cts` source; `.cts/.cjs` companions остаются ambiguity.
Extensionless ссылки на эти форматы не получают fallback. Compiler output
находится вне authored inventory и удаляется после проверки.

Проверяемый config — `module: CommonJS`, `moduleResolution: node10`; для закреплённого
TypeScript 6 явно задано `ignoreDeprecations: "6.0"`. Aliases проверяются compiler,
их bare specifiers требуют настроенного runtime loader. `packageExportsWrite`
с CommonJS inventory отклоняется целиком; require-mode package mappings,
NodeNext/Node16, project references и automatic consumer completeness остаются
отдельным остатком. Полноту ограниченного `referenceRoots` гарантирует trusted host.

Приёмка включает Node для CJS и TypeScript emit/Node для CTS до/после file/tree
move, static/dynamic references, aliases, preview без writes, полный receipt/hash,
retry, shadowing/ambiguity/collisions, ACL/drift и реальный SIGKILL/resume.
Parser/resolver, native writer и crash recovery переиспользуются; новые scanner
или mutation engine не создаются. Формальные guards не заменяют typecheck,
проверку runtime и поведения приложения.

## 29. CommonJS через точные workspace exports: четырнадцатый срез TASK-94

Контракт §24–25 распространяется на зарегистрированные `.cjs/.cts` profiles из
§28. `packageExportsWrite` остаётся явным host opt-in одного workspace owner;
перенос файла или дерева происходит внутри package. Public package name/subpath
и ссылки consumers сохраняются, target literals в `exports` меняются прежним
dependent `config.package-exports` effect. Native writer, ACL, frozen manifest,
receipt, retry и recovery не получают второго пути исполнения.

Общий `agent-search` допускает `import` и `require` в `relocation-exports`:
root string и flat exact map задают одинаковый target для обоих modes, без
условного выбора. Engineering проверяет каждый owner export, включая unused,
во всех original/final nearest configs существующим import-mode proof; для
этих mode-independent mappings это тот же target. Реальные source references
повторно проверяются с переданным mode. Shared tests обязаны подтвердить
эквивалентность targets/provenance и сохранение ACL/cache/ambiguity для обоих modes.

Проверяемый package config — `moduleResolution: bundler`, `module: ESNext`.
Полный установленный TypeScript проверяет CJS через strict `checkJs`, CTS — с
emit `.cjs` во внешнюю временную область; Node исполняет package graph до/после.
Один `transpileModule` не является compiler evidence. В этом `ESNext` config
TypeScript запрещает `import = require`; CTS oracle использует static imports и
типизированный прямой `require`. Поддержка import-equals из §28 сохраняется для
совместимого CommonJS config; этот срез не объявляет его совместимым с ESNext.
Тестовые workspace links
создаются существующим fixture; production search по-прежнему не читает
`node_modules`. Emit и links вне authored inventory не расширяют source grants.

Guards §28 для require, naming/owner/boundary и completeness referenceRoots
сохраняются. `node10`/legacy package fallback, NodeNext/Node16, conditional и
wildcard exports, arrays/null, `#imports`, несколько изменяемых owners и перенос
между packages не включены. Неоднозначные source/runtime companions, baseUrl/paths
shadowing, скрытые boundaries и неполный inventory блокируют перенос.

Приёмка: root/subpath, literal/glob workspaces, file/tree moves, несколько configs,
неизменные consumers при закрытом write ACL, TypeScript/Node до/после, BOM/CRLF,
preview без writes, полный receipt/hash/retry, ACL/drift и SIGKILL/resume вокруг
manifest effect. Изменение общего resolver требует проверки его потребителей и
`check:search`; isolated evidence не подтверждает installed/ChatGPT acceptance.

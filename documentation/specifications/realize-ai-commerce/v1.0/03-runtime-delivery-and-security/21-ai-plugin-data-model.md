# 21. AI plugin data model

- **Статус:** target specification
- **Дата сверки реализации:** 11 сентября 2026 года

## 21.1. Operational aggregates

Нормативные группы:

- Conversation, Message;
- Run, RunEvent, CheckResult;
- ChangeRequest, Approval;
- DataOperation и rollback evidence;
- ExecutionJob, Deployment/Preview;
- SourcePromotion, ReleaseCandidate, ProductionDeployment;
- Integration и IntegrationEvent;
- UsageRecord и AuditEvent.

Current plugin реализует значительную часть этих групп, но не
`ProductionDeployment` и commercial aggregates.

## 21.2. Installation AI configuration

Target overlay содержит:

- Skill;
- KnowledgeSource и KnowledgeDocument;
- PromptTemplate;
- LocalRule;
- LocalRole и CapabilityBinding;
- CheckBinding;
- AgentProfile;
- WorkflowDefinition;
- EvalCase и EvalRun;
- AIConfigDraft и immutable AIConfigRelease;
- ActiveConfigPointer.

Editable entities принадлежат draft. Создание release фиксирует snapshot manifest
с versions/content hashes, creator и system compatibility range. Activation
отдельно выбирает этот immutable выпуск через versioned pointer. Validation/eval
evidence и approver входят в целевую модель; текущий выпуск требует серверной
валидации и успешной компиляции включённых профилей, без eval runner.

`AIConfigDraft` фиксирует stable ID, optimistic-lock revision, base release и
набор typed artifacts. Каждый artifact имеет kind, stable key, revision,
enabled state и canonical content. В одном draft пара `kind + key` уникальна.

`AIConfigRelease` содержит полный immutable snapshot либо ссылки на immutable
knowledge versions, source draft/revision, system compatibility range,
artifact hashes и общий manifest hash. `ActiveConfigPointer` связывается с exact
release ID и manifest hash и меняется отдельной versioned activate/rollback
command. Mutable draft не является runtime source.

Первый persistence slice хранит installation config четырьмя hidden
коллекциями Payload:

- `realize-ai-config-drafts` — mutable aggregate с `draftID`, явной aggregate
  `revision`, state, base release и typed artifacts JSON;
- `realize-ai-config-releases` — append-only full snapshot с уникальными
  `releaseID`/`releaseKey`, manifest hash и system compatibility;
- `realize-ai-active-config-pointers` — append-only история exact pointer
  versions; единственный active pointer определяется максимальной version;
- `realize-ai-config-events` — append-only audit/idempotency ledger с action,
  actor, request hash и bounded response snapshot.

Обычные Payload CRUD endpoints для этих коллекций закрыты. Все Local API writes
выполняются только после отдельного configuration-management access gate и
проходят через один Payload request/transaction. Draft replacement использует
conditional update по `draftID + revision` под общей транзакционной блокировкой;
release и event создаются атомарно. Переключение pointer и соответствующий
event также входят в одну транзакцию с проверкой ожидаемой версии.
Повтор `Idempotency-Key` допустим только для того же actor, action и canonical
request hash.

Draft lifecycle первого среза: `editing -> ready -> released`. Любая замена
artifacts снова переводит draft в `editing`; successful validation переводит
его в `ready`; release фиксирует exact ready revision и переводит aggregate в
`released`. Invalid validation не изменяет draft. Artifact revisions остаются
частью canonical content: новый artifact начинается с revision 1, неизменённый
сохраняет revision, изменённый повышает её ровно на один.

`ActiveConfigPointer` изменяется отдельной activate/rollback командой с exact
release/system hashes и `expectedPointerVersion`. Каждое переключение создаёт
новую версию pointer; rollback требует более ранний совместимый выпуск.
Повтор подтверждённой команды возвращает сохранённый response snapshot,
даже если active pointer уже изменился. Создание release не активирует его.

Эта persistence schema реализована migration
`20260901_163832_ai_config_persistence`; generated Payload types и collection
registry включают все четыре коллекции.
Миграция `20260910_122259_ai_config_activation` добавляет в enum config events
значения `config_activated` и `config_rolled_back`.

В Admin `/admin/ai/settings` реализованы общий каталог и типизированный просмотр
всех восьми сохранённых видов: `agent_profile`, `local_role`, `local_rule`,
`skill`, `prompt_template`, `workflow_definition`, `capability_binding` и
`check_binding`. Прямые и обратные связи вычисляются из artifacts выбранного
черновика по точной паре `kind + key`; отдельная persistence для этих списков
не создаётся. Ссылки на capability/check registry остаются системными.
Черновик ограничен 512 artifacts; даты и авторы принадлежат aggregate,
у отдельных artifacts таких полей нет.

Редакторы `local_rule`, `agent_profile`, `local_role`, `skill`, `prompt_template`,
`capability_binding`, `check_binding` и `workflow_definition` сохраняют остальные
artifacts, их revisions и base release.
Ссылки `agent_profile.ruleKeys` защищают используемое
правило от удаления. Сохранённый ключ профиля в редакторе неизменяем; копирование
создаёт локальную форму с уникальным ключом, а после сохранения — новый artifact
с revision 1. Исходный профиль и его массивы связей не изменяются.

Профиль хранит семь групп ссылок: `roleKeys`, `skillKeys`, `ruleKeys`,
`promptTemplateKeys`, `workflowKeys`, `capabilityBindingKeys` и `checkBindingKeys`.
Каждая группа содержит до 128 уникальных ключей своего вида в том же draft.
Необязательный `defaultWorkflowKey` входит в `workflowKeys`; форма очищает его
при исключении соответствующего рабочего процесса. Отсутствующие или выключенные
цели не удаляются из связей автоматически: редактор показывает их состояние
и позволяет явно исключить ссылку. Семантические проверки остаются серверными.

Роль хранит `instructions` и `capabilityBindingKeys`; навык дополнительно хранит
`description` и `triggerTerms`. Условия применения — упорядоченный список
до 128 уникальных непустых строк длиной до 120 символов. Шаблон хранит `template`,
`variables` и `slot` со значением `agent_instructions`, `planner`, `reviewer`
или `workflow_step`. Список переменных содержит до 128 уникальных ключей.
Редакторы проверяют структуру и лимиты; наличие целей связей и согласованность
переменных с текстом шаблона проверяются при валидации черновика.

Связь возможности хранит точные `capability.id` и `capability.version`,
`allowedActions` и необязательные `readScopes`, `writeScopes`, `maxTargets`.
Действия и области содержат до 128 уникальных ключей. Отсутствующие области
наследуют SYSTEM; явный `[]` исключает соответствующие области полностью.
Отсутствующий `maxTargets` наследует системный лимит, заданный — положительное
безопасное целое число. Форма сохраняет его как строку до преобразования
в существующий DTO; пустое поле означает отсутствие ограничения в binding.
Системный предел при этом продолжает действовать.

Связь проверки хранит стабильный `checkID` серверного реестра. Формы выбирают
цели из bootstrap и сохраняют отсутствующие цели и прежние ограничения до
явного изменения. Структурно допустимые, но незавершённые связи можно сохранять
в черновике; компиляция включённых профилей сверяет выбранные bindings
с exact SYSTEM registry и запрещает расширение его полномочий.

Процесс хранит `description`, `entryStepKey`, `maxSteps` от 1 до 64
и до 64 шагов. Доступны `agent_turn`, `request_input`, `capability`, `check`,
`branch`, `finish`. Источник значения — `input` с путём, `step_output`
с ключом шага и путём либо `literal` с JSON-совместимым значением.
У capability step до 64 входных полей. В форме они представлены строками
с независимыми ID, чтобы незавершённые и повторяющиеся имена не теряли значения;
перед сохранением mapper проверяет их и создаёт canonical объект `input`.

Локальный ID шага сохраняет выбор при правке его ключа. Неприменённый `keyInput`
входит в несохранённый ввод и блокирует отправку. Подтверждённое переименование
одновременно меняет ключ, `entryStepKey`, переходы и ссылки `step_output`.
Локальные ID, `keyInput` и строковые формы чисел не попадают в DTO.
Структурно корректные отсутствующие ссылки и незавершённый граф сохраняются
для последующего исправления; полная проверка графа остаётся серверной.

Сохранённые ключи роли, навыка, шаблона, обеих связей и процесса неизменяемы в UI.
Копия получает уникальный ключ среди записей того же вида; после явного сохранения
она добавляется с revision 1. Содержимое, порядок списков и исходные связи
сохраняются, входящие ссылки других artifacts не переписываются.

Копирование всего черновика переносит его состав в новый editing draft с artifact
revisions 1. Схема persistence и публичные DTO редакторами не расширяются.
База знаний ещё не подключена. Исполнение сохранённых процессов использует
отдельный runtime checkpoint и не меняет definition редактора.

## 21.3. Снимок конфигурации chat run

Новый настроенный запуск сохраняет `AIChatConfigurationSnapshot` в существующем
JSON-поле `runs.turnContext.agentConfiguration`: `schemaVersion: "1.0"`,
`pointerVersion`, `releaseVersion` и `compiled`. `CompiledAgentConfiguration`
содержит точные config/system release IDs и hashes, system version,
`projectProfile`, профиль, выбранные artifacts с content hashes, разрешённую
compiler проекцию capabilities/checks и `compiledContextHash`.

Этот снимок принадлежит серверу и закрыт от публичного RunDTO. Mapper выдаёт
только `AIChatConfigurationSummary`: release ID/version/hash, profile
key/title/revision, compiled/system hashes, system release ID и pointer version.
`runtimeContextHash` и ограниченная `conversationHistory` остаются в закрытом
run context. Публичный контекст Message сохраняет вложения, выбранные файлы
и web-search flag; инструкция installation profile через него не выдаётся.

Новые колонки не нужны: `runs.turn_context` уже создан migration
`20260909_190959_chat_message_context`. Исторический idempotent replay возвращает
исходный run до разрешения текущего active pointer. Изменение draft, выпуск
или активация новой версии не переписывают snapshot старого запуска.

### 21.3.1. Workflow checkpoint

`runs.turnContext.workflow` хранит закрытый `WorkflowCheckpoint`:
`schemaVersion: "1.0"`, `workflowKey`, `version`, `stepKey`, `completedSteps`,
`phase`, `input`, `outputs` и необязательные `parentRunID`, `rootRunID`, `reason`,
`lastCapability`. Последнее поле содержит только ссылку `{stepKey,
dataOperationID, operationHash}` на фактический DataOperation; сервер отдельно
проверяет его audit provenance и доступность.

Фазы — `ready`, `running`, `awaiting_input`, `completed`, `blocked`.
Один AIRun соответствует сегменту процесса; поэтому завершённый `RunStatus`
может иметь checkpoint `ready` или `awaiting_input`. Завершение всего процесса
определяется его workflow phase. SQL enum `runs.status` не расширяется.
Checkpoint и обычные сообщения/события сохраняются существующими коллекциями;
новые колонки, миграции и generated types не требуются.

Terminal checkpoint сегмента неизменяем. Продолжение создаёт дочерний run
с server-derived unique idempotency key по parent ID; canonical request hash
включает parent ID и проверенный ввод. Unique insert и транзакция связывают
child, сообщение, checkpoint и созданные dry-run receipts; повтор возвращает
тот же дочерний run. Внутреннее пространство idempotency keys закрыто
от пользовательских команд. Сегмент наследует сохранённый snapshot,
а не текущий active pointer.

Публичный `RunDTO.workflow` выдаёт только `key`, `title`, `revision`, `stepKey`,
`stepType`, `version`, `completedSteps`, `phase`, безопасную `reason`
и parent/root run IDs. Input, outputs, template и private snapshot не выдаются.
Checkpoint проверяется по bounded JSON contract и непрерывному пути exact графа;
поддельные результаты будущих или пропущенных шагов отклоняются.

Клиентский `workflowDraft: {key, inputText, profile?}` принадлежит только состоянию
формы и переносу между размещениями чата. `profile` — exact
`AIChatConfigurationSelection`; непустой ключ процесса требует такой привязки.
`inputText` сохраняет до 131 072 символов сырого, в том числе незавершённого JSON.
Черновик не подменяет `runs.turnContext.workflow` и не передаётся как trusted
runtime state; API принимает только разобранный и проверенный start input.

У сохранённого `queued` AIRun может быть private phase `running`, когда передача
в control plane ещё не подтверждена. Повтор этого запуска сохраняет тот же run
и не создаёт child. Если control plane возвращает `404` для уже `running` AIRun,
событие ошибки и checkpoint `blocked` сохраняются атомарно; provider turn
не восстанавливается путём скрытого повторного исполнения.

## 21.4. Общие инварианты

Operational collections скрыты от обычного Payload CRUD UI/API либо имеют
отдельный least-privilege access. Credentials хранятся write-only encrypted
envelopes. Audit и approvals append-only. DTO redacted и versioned.

Runs/Change Requests ссылаются на exact system/config/capability versions.
Удаление или изменение source draft не меняет исторический execution context.
Retention и hard delete определяются отдельной policy, а не cascade по запросу
модели.


Реестр `/admin/ai/runs` читает эти же AIRun и checkpoint. Корневая строка
соединяется с дочерними сегментами по существующему unique idempotency key;
отдельная workflow-run коллекция и дублирующие поля не добавляются. История
карточки проверяет неизменность snapshot, исходного input и уже завершённых
outputs между сегментами. DTO выдаёт только типизированную проекцию результатов
и owned DataOperation, сверенную с workflow audit. Пагинация применяется к
актуальным процессам на сервере; лимиты загрузки чата на неё не влияют.
Точный surface описан в [реестре запусков](22-api-and-streaming-contracts.md#227-реестр-и-история-запусков-процессов).

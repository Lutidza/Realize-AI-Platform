# Task manager — контракт исполнения и интеграции с AI

Версия: **0.20**, 2026-11-25. Статус: **проект технической части ТЗ с реализованными ограниченными срезами**.
Читается вместе с [продуктовым ТЗ](task-management.md). Новые сущности,
команды и состояния ниже — целевой контракт, кроме явно обозначенных
реализованных срезов §8.1–8.3 и §12–14. В §8 описано, как Assignment восстанавливает
попытку по [контрольной точке](task-management/execution/checkpoint-storage.md)
и как Task Manager [публикует отчёт и карту покрытия в досье](task-management/execution/audit-report-publication.md).
Этот процесс проверен на отдельной PostgreSQL с имитатором. Intake локального CLI описан отдельно
в §8.3/§12.4; он не добавляет серверную приёмку или полный artifact lifecycle.
Выбор контекста и управление Project/List из §12.5 реализованы в исходниках;
локально активированная сборка пока сохраняет предыдущий серверный интерфейс.
Этот документ не меняет действующие AI rules и не разрешает запуск/публикацию кода.

Подтверждённое направление постоянного Task Manager, commit/release связей и
cutover описано в [продуктовом ТЗ §15](task-management.md#15-разработка-платформы-git-и-переход-к-постоянным-задачам).
Граница первого bounded Foundation — §12; ограниченное чтение Git-фактов — §13.
Долговечная синхронизация по явному запросу — §14.
Остальные новые API остаются целевыми.

Архитектура общих инженерных операций —
[ADR-0019](../architecture/decisions/ADR-0019-shared-engineering-operations.md).
Task Manager сохраняет собственные domain contracts, ACL, транзакции и replay;
файловый journal хранит ссылки на задачи и результаты, без второй модели задач.
Целевой lifecycle/relations/API уточнён в [§15](#15-целевой-контракт-задач-eng-04)
(TASK-62 / ENG-04); реализация относится к ENG-16–20. Этот контракт не меняет
перечисленные выше реализованные срезы.

## 1. Проверенное состояние и владельцы

Проверено по коду 2026-09-17. Документация текущего контура:
[интеграция Codex](../architecture/codex-integration.md),
[delivery](../delivery/02-ci-release-deploy.md).

| Область                   | Существующий источник                                                                                                                                                                                                                                  | Что можно использовать                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Диалоги, сообщения, AIRun | [repository](../../packages/payload-ai-plugin/src/endpoints/repository.ts), [runs](../../packages/payload-ai-plugin/src/collections/runs.ts)                                                                                                           | IDs, история, idempotency, контекст и run status                                              |
| AI-конфигурация           | [aiConfiguration](../../packages/ai-contracts/src/aiConfiguration.ts), [compiler](../../packages/change-engine/src/aiConfigurationCompiler.ts)                                                                                                         | Draft, immutable release, active pointer, profiles, roles, rules, skills, templates, bindings |
| Снимок запуска            | [AIChatConfiguration](../../packages/ai-contracts/src/AIChatConfiguration.types.ts), [resolver](../../packages/payload-ai-plugin/src/chat-context/resolveAIChatConfiguration.service.ts)                                                               | Серверная сборка exact release/profile и закрытый snapshot                                    |
| Workflow definition       | [workflows](../../packages/ai-contracts/src/workflows.ts), [policy](../../packages/change-engine/src/workflowPolicy.ts)                                                                                                                                | Ограниченные шаги, ветвление и проверка графа                                                 |
| Workflow continuation     | [continue](../../packages/payload-ai-plugin/src/chat-context/continueWorkflow.service.ts), [dispatch](../../packages/payload-ai-plugin/src/chat-context/dispatchWorkflowSegment.service.ts)                                                            | Checkpoint, сегменты, продолжение, фактический child run                                      |
| «Запуски процессов»       | [registry](../../packages/payload-ai-plugin/src/endpoints/WorkflowRunRegistry.repository.ts), [SQL](../../packages/payload-ai-plugin/src/endpoints/workflowRunRegistry.sql.ts)                                                                         | Проекция workflow по существующим AIRun                                                       |
| Code Lane                 | [executionHandlers](../../packages/payload-ai-plugin/src/endpoints/executionHandlers.ts), [jobRepository](../../services/ai-execution-worker/src/jobRepository.ts), [worker](../../services/ai-execution-worker/src/worker.ts)                         | Approved plan, durable очередь jobs, claim, исполнение, проверки и delivery                   |
| Reviewer и изоляция       | [reviewer](../../services/ai-execution-worker/src/independentReviewer.ts), [worktree](../../services/ai-execution-worker/src/worktree.ts)                                                                                                              | Независимая проверка и отдельный checkout                                                     |
| Provider connection       | [service](../../packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnection.service.ts), [lock](../../packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnectionLock.adapter.ts)                                          | Credentials lease, фактические модели и сериализация доступа                                  |
| События                   | [stream bridge](../../packages/payload-ai-plugin/src/endpoints/stream.ts), [workflow persistence](../../packages/payload-ai-plugin/src/chat-context/persistWorkflowAgentEvent.service.ts), [RunStore](../../services/ai-control-plane/src/runStore.ts) | Формат событий, durable replay/checkpoint при обработке потока                                |
| Readiness                 | [release guard](../../packages/payload-ai-plugin/src/endpoints/releaseWorkerReadiness.validator.ts), [availability](../../packages/payload-ai-plugin/src/integrations/runtime/mapWorkerAvailability.mapper.ts)                                         | Проверка конкретной capability и свежести worker перед принятием работы                       |

Наличие этих владельцев не означает готовность многоагентного task manager.

### 1.1. Обязательные разрывы между текущим кодом и целевой моделью

| ID     | Сейчас                                                                                              | Что требуется для ТЗ                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GAP-01 | Profile — набор конфигурации; назначаемого agentID нет                                              | Устойчивая AI-идентичность, состояние, задания, команды и adapter reference                            |
| GAP-02 | Workflow: 6 типов шагов, до 64 шагов; одна цепочка child на parent; agent_turn выбирает шаблон      | Версионированное назначение участника/профиля на этап, fan-out/fan-in, правила собирания результатов   |
| GAP-03 | Новый run требует активный release; продолжение наследует старый snapshot/model                     | Явное поведение queued task при смене active pointer, без молчаливой подмены                           |
| GAP-04 | Workflow start отклоняет attachments/projectFiles/pageDraft                                         | Авторизованный context adapter материалов задачи и отдельное расширение input contract                 |
| GAP-05 | Workflow capabilities/checks обслуживают ограниченный Data Lane                                     | Task-команды, Code Lane/handoff/check adapters и реальные receipts по новым сценариям                  |
| GAP-06 | Code executor использует integration model/server policy; chat profile не переносится автоматически | Проверяемое применение выбранной конфигурации по поддерживаемым lanes, без фиктивных полей UI          |
| GAP-07 | Общий Codex lock и одно основное подключение; busy возвращает отказ                                 | Durable admission, capacity-aware очередь, fairness; параллельность только при подтверждённой изоляции |
| GAP-08 | Conversation/Run/CR защищены текущим пользователем-владельцем                                       | Командный ACL, scoped projection и service delegation без подстановки чужого req.user                  |
| GAP-09 | CP RunStore хранится в памяти; сохранение потока/checkpoint проходит через SSE bridge               | Server-owned ingestion/reconciliation, устойчивое состояние без browser connection                     |
| GAP-10 | Claim Code jobs есть, общего task scheduler/lease recovery нет                                      | Долговечный план, dependencies/resources, fencing, отмена и восстановление неизвестного исхода         |
| GAP-11 | Task/assignment correlation отсутствует в строгом AI input                                          | Типизированные ссылки на задачу/этап/попытку в контрактах и событиях                                   |

Например, один существующий workflow agent turn не может сам выбрать другого
исполнителя. Прикрепление текста «agent B» в prompt не устраняет GAP-01/02/11.
Проверка UI-селектора не доказывает, что execution runtime применил настройки.

## 2. Границы модулей и переносимость

**Task domain** владеет проектами/иерархией, задачами, task-role assignments,
handoff, task relations и связями с диалогами, доступом к досье, обсуждением,
критериями и предметной приёмкой. Здесь хранятся intent
исполнения, декларативный план назначений и ссылки на authoritative runtime objects.
Task scheduler определяет зависимости между самостоятельными executions и их
готовность к передаче; не исполняет внутренние переходы workflow.

**AI-layer** владеет каталогом конфигурации, provider connections, реальной
агентной идентичностью, workflow engine, запуском, capabilities, sandbox,
runtime state и фактической очередью исполнения. Agent participant задачи
ссылается на идентичность адаптера; копия profile не становится вторым агентом.

**Диспетчер этапов** принадлежит существующему AI orchestration owner и управляет
готовностью этапов и передачей их конкретному runtime. Он не исполняет
модель, shell или Code job вторым независимым worker внутри task plugin.
После передачи runnable work claim/retry принадлежат исходному исполнителю.
У шагов workflow, fan-out/join и checkpoint ровно один transition owner —
workflow engine. TaskExecutionPlan задаёт bindings и проецирует его шаги;
локальная проекция задачи не может независимо завершить join или выдать тот же шаг.

**AIRuntimeAdapter** — версионированная серверная граница. Название условное.
Task package не импортирует внутренние сервисы, host payload-types и пути
Realize. Адаптер использует публичные контракты владельцев. Недостающие
контракты сначала расширяются у владельца; обхода через прямую запись чужой
коллекции, SQL или подмену HTTP user нет.

| Контур поставки    | Целевое условие                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Task package       | Установка npm-архива в независимый Payload-host, без workspace symlinks/alias Realize                                        |
| Realize AI adapter | Полная интеграция с Admin Assistant обязательна для продукта; текущая основа PostgreSQL-specific                             |
| Другие Payload DB  | Поддержка task domain проверяется отдельно; полное AI-исполнение требует совместимого runtime adapter                        |
| MongoDB/SQLite     | Цель переносимости; не объявляются готовыми вместе с нынешним PostgreSQL-only AI adapter                                     |
| Hosting            | UI не требует shell/writable checkout; исполнение через локальный либо удалённый server adapter с нужной capability          |
| UI dependencies    | Общий UI-kit поставляется доступной версией либо утверждается другой единый owner; скрытого private workspace dependency нет |

Настраиваются auth-коллекция, ACL callbacks, namespace, Admin/API routes,
tenant resolver при наличии, artifact storage и AI adapter. IDs пользователей
могут быть строковыми/числовыми. Плагин не перезаписывает чужие hooks/plugins.

Bootstrap — dependency + plugin config + adapter + versioned host migrations +
import map/types + build/deploy. Установщик расширений автоматизирует этот путь,
но не обязателен. Установка package без ready AI-runtime не завершается
надписью «ИИ-исполнение готово». Поддерживаемые версии и режимы публикуются
по фактическим тестам; нынешний baseline Payload 3.88.0 не доказывает весь диапазон 3.x.

### 2.1. Project ownership и TaskRelation

Project имеет собственный ID/revision, workspace, membership,
состояние и defaults. Каждая Task содержит projectId и основной listId;
List/Folder/parent task согласованы по projectId. Пользовательские команды
создания/переноса проверяют это сервером, включая массовые операции и импорт.
Членство/настройки Project не дублируют AI profile registry и provider credentials.

Межпроектный перенос сохраняет Task ID и исторические snapshots, требует плана
mapping статусов/полей/назначений/bindings и связанных подзадач. Пока активные
attempts не закончены/подтверждённо остановлены, перенос не применяется.
Проверяются полномочия исходного/целевого проекта и доступ к будущему контексту;
старые approvals/scope не переносятся автоматически. Отказ проверки не оставляет
часть дерева в другом проекте. Архивирование использует тот же admission guard.

TaskRelation хранит relationID/revision, type, обе task IDs, автора/причину;
для depends_on — направление, target execution/stage/artifact при наличии,
предикат готовности и требуемую версию результата. Для related уникальность
пары симметрична: A–B и B–A — одна связь. Для depends_on сохраняется одна
ориентированная запись, «блокирует» вычисляется как её обратное отображение.
Parent/child остаётся отдельным контрактом и не подменяет dependency.

Межпроектное ребро не меняет projectId или ACL. Управление связью требует
доступа и разрешения на соответствующую связь с обеих сторон; серверная проверка
не возвращает закрытые названия или содержимое. Разрешение scheduler оценить
условие имеет ограниченный scope и не даёт участникам доступ к predecessor.

## 3. Назначение и неизменяемый план

### 3.1. Agent assignment

Назначение содержит task/role/participant, миссию, ожидаемый результат,
входные artifact revisions, scope чтения/записи, workflow/stage, profile/AI roles,
policy режима, проверки, лимиты, зависимости и исполнителя приёмки.
Одна роль имеет много assignments; каждый исполняемый assignment адресуем отдельно.

Состав команды и назначения фиксируются при подготовке TaskExecution.
Заменить участника будущего этапа можно новой ревизией плана с записью причины.
Назначение уже работающего этапа не переписывается задним числом:
старый attempt завершается/останавливается по правилам, новый получает свою запись.

Ручное назначение не требует profile/model/provider. Уполномоченный человек
принимает задание, начинает работу и сдаёт result manifest через task-команды
с expectedRevision. Workflow получает подтверждённое событие сдачи/приёмки и
только после него открывает зависимый этап. Для такого назначения действуют
срок ответа и напоминания, а не lease/heartbeat автоматического worker.
Обратная передача агенту фиксирует новую входную версию результата человека.

### 3.2. Snapshot

До dispatch фиксируются:

- task/project revisions, критерии, область/tenant, relation graph revision и ACL/delegation reference;
- plan/assignment revisions, агентные IDs и раскрытый состав команд;
- workflow key/revision/release/hash, profile и набор AI roles/rules/skills/checks;
- фактически разрешённые mode/model/capabilities/sandbox policy и runtime protocol;
- версии и hashes входных материалов, context manifest и лимит контекста;
- зависимости на версии результатов, ресурсы, budget и idempotency key.

Контекст диалогов представлен link/message revisions и разрешёнными фрагментами;
handoff ссылается на исходные/целевые назначения и manifest передачи.

Секреты не сериализуются в task snapshot. Полный compiled instruction snapshot
закрыт на стороне runtime; клиент получает безопасную сводку и hashes.

Новый запуск с устаревшим активным release по текущему контракту блокируется
как `configuration_changed` с пересмотром binding. Использование исторического
release для нового run требует отдельного расширения policy и проверки;
сохранённые допустимые continuations используют свой snapshot.
Профиль «последний доступный» не подставляется автоматически.

Контекст содержит только выбранные и доступные данные. Большое досье передаётся
индексом/ссылками и ограниченными фрагментами, а не целиком в checkpoint.
Нынешние ограничения размера/числа шагов runtime учитываются; chunking не должен
терять критерии, права или ссылки. Материалы задачи считаются данными, а не
инструкциями, повышающими полномочия.

### 3.3. Передача и делегирование работы

TaskHandoff — предметная операция передачи работы. Она отличается от scoped
delegation полномочий сервису из раздела 7: передача задачи не создаёт разрешений.
Команда содержит handoffID/idempotencyKey, task/project, expected task/assignment
revisions, вид transfer/coexecution/delegate, исходное/целевое назначения,
инициатора/получателя, причину, scope, budget и manifest контекста/результатов.
Coexecution создаёт отдельный assignment; delegate дополнительно сохраняет
цепочку делегирования и правило возврата/агрегации результата.

| Состояние handoff           | Контракт                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| requested                   | Получатель и контекст указаны; прежнее назначение не удаляется                                                                                         |
| accepted                    | Получатель или разрешённая policy принял задание; готовность агента проверена, выполнение ещё может ждать ресурс                                       |
| applying                    | Для замены исполнителя подтверждается завершение/остановка старой работы; для соисполнения разделяются задания/ресурсы; конфликтующая работа не выдана |
| completed                   | Новое назначение и план применены атомарно, история и уведомления сохранены; можно заново пройти admission                                             |
| declined / cancelled        | Причина сохранена; старое назначение не потеряно, дублирующего исполнения нет                                                                          |
| blocked / recovery_required | Отсутствует право/контекст/ресурс либо исход старого attempt неизвестен; нужна конкретная корректировка/сверка                                         |

При замене ожидающего в очереди assignment старый dispatch сначала инвалидируется
до submit либо подтверждённо отменяется у runtime owner после submit. Для
замены running assignment сохраняются результат и checkpoint безопасной остановки;
новому attempt выдаётся новое владение ресурсами/fencing только после сверки.
Передача не меняет executor у уже существующего run. Поздний результат старого
attempt не перезаписывает принятое состояние нового назначения.
Добавление независимого соисполнителя/делегирование непересекающейся части
не требует остановки ведущего: отдельные assignments могут идти параллельно
после проверки scope, ресурсов и общей ревизии плана.

Human→human, human→agent, agent→human и agent→agent проходят один предметный
контракт с соответствующим способом подтверждения. Провайдерский thread,
credentials и право читать личный чат прежнего исполнителя не передаются
автоматически. Контекст готовится из разрешённых task artifacts/message extracts
с версиями; отсутствие необходимого материала является blocker.

Дальнейшая делегация ограничивается allowDelegation/maxDepth, выделенным scope
и долей общего budget. Дочерняя делегация не увеличивает суммарный лимит;
разрешения проверяются для каждого фактического участника. Завершение одного
соисполнителя публикует его результат, а общий fan-in/приёмка остаются у своего owner.

## 4. Контракт команд и событий адаптера

Это предлагаемые операции протокола, не существующие названия endpoints.

| Операция              | Обязательный контракт                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Catalog/Capabilities  | Видимые агенты, конфигурации и workflows; protocol/version; supported lanes, control actions и capacity      |
| Resolve/Preflight     | Exact plan, readiness, scope/ACL, dependencies, resource needs и причины отказа; без side effects исполнения |
| Submit                | Идемпотентная передача snapshot; accepted receipt с authoritative IDs либо однозначный отказ                 |
| LookupByKey/Reconcile | Найти результат submit после потери ответа; сверить внешний эффект/attempt до повтора                        |
| Read/Subscribe        | Пагинируемые события и snapshot с cursor/sequence; server-to-server доставка не зависит от browser           |
| Continue/Input        | Ожидаемая версия/step и разрешённый input; новая attempt/continuation, без перезаписи прошлого               |
| Pause/Cancel          | Durable intent, поддерживаемая безопасная точка, подтверждённый outcome; неизвестный исход виден             |
| Retry                 | Новая связанная попытка после проверки конфигурации/прав/эффектов; не команда сменить status на queued       |
| Result/Acceptance     | Версии артефактов, checks/receipts, verdict и допустимые следующие действия                                  |

Command envelope: protocolVersion, host/tenant/project/task/execution/stage/attempt IDs,
actor/delegation, expectedRevision, idempotencyKey, correlationID и payload
разрешённого типа. Сервер выводит полномочия из своей политики; клиентские поля
`role` или `capability` не являются разрешением.

Receipt хранит conversation/message, workflow root/segment, AIRun,
DataOperation/ChangeRequest/executionJob/deployment/release references по наличию.
Одна задача имеет много attempts; `lastRunID` не заменяет цепочку.
Публичные DTO не возвращают raw Payload docs, credentials или приватные инструкции.

Event envelope: eventID, eventType, task/execution/stage/attempt, source object
и revision, actor/delegator, occurredAt/receivedAt, sequence, correlationID,
causationID, безопасный payload либо ссылка на объект. Дедупликация — по ID
в области `(adapterID, sourceObjectID, eventID)`. У каждого источника свой
cursor/sourceSequence; одинаковые номера разных runs не конфликтуют.
После durable ingestion история задачи получает отдельный taskSequence.
Порядок внутри источника и causation сохраняются; timestamp и arrival order
не выдают события параллельных агентов за одну гарантированную хронологию действий.

Гарантия доставки — повторяемая с идемпотентным применением, а не обещание
exactly-once для любого внешнего сервиса. Durable commit предшествует уведомлению.
Если потеряно подтверждение после внешнего действия, сначала reconciliation.
Операция с неизвестным исходом не запускается повторно вслепую.

## 5. Состояния задачи и исполнения

Пользовательский status задачи имеет стабильный ID и категорию.
`readiness`, `executionState`, `acceptanceState` и состояние delivery отдельны.
Custom status не служит прямой записью в worker state.

Операционные переходы, базовые status IDs, права и совместимость первого
расширения Foundation конкретизированы в [§15](#15-целевой-контракт-задач-eng-04).
Состояния runtime ниже остаются у исполнителей и не записываются UI как task status.

| Состояние task execution/stage   | Семантика                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| draft / ready                    | План готовится / прошёл проверки для будущего запуска                                    |
| blocked                          | Не выполнено конкретное prerequisite; reason и путь разрешения обязательны               |
| scheduled                        | Запланировано на время; это не обещание доступного worker сейчас                         |
| queued                           | Готовый этап принят, ожидает разрешённый ресурс; действует queue deadline                |
| dispatching                      | Передаётся владельцу runtime; исход восстанавливается по idempotency key                 |
| running                          | Runtime подтвердил исполнение; известны attempt/heartbeat                                |
| waiting_input / waiting_approval | Требуется конкретный ввод или решение; ресурсы удерживаются только по явной причине      |
| pause_requested / paused         | Запрошена остановка на безопасной точке / она подтверждена                               |
| cancel_requested / cancelled     | Намерение отмены сохранено / исходный owner подтвердил остановку                         |
| publishing_result                | Исполнение дало результат, но обязательные файлы/manifest ещё не опубликованы долговечно |
| succeeded / failed               | Получен фактический результат этапа; не равняется приёмке задачи                         |
| recovery_required                | Потеря связи/lease или неизвестный side effect; новая работа ждёт сверки                 |

Основной путь: ready → queued → dispatching → running → succeeded/failed.
Любой succeeded требует durable result manifest, даже если список файлов пуст.
Если результат содержит материалы, перед succeeded используется publishing_result:
обязательные artifact revisions должны стать ready, а manifest с их hashes —
durable. До этого fan-in не принимает результат. Публикация восстанавливается
идемпотентно; provider success и наличие файла только в worktree недостаточны.
Wait/input, approvals и управление исполнением — разрешённые ветви с проверкой
версии. Повтор создаёт новый attempt, связанный с предыдущим. Старые succeeded/
failed/cancelled записи неизменяемы; позднее событие их не «оживляет».

Предметная задача переходит на тестирование/приёмку по правилам плана.
Категория Done обозначает выполненную работу, Closed — завершённый процесс
по согласованным критериям. При переоткрытии сохраняются старое решение и причина.
Сервер применяет одинаковые gates к drag-and-drop, массовой операции и API:

| Категория / событие                          | Условие и эффект                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Active                                       | Работа/ожидание/возврат на исправление; отдельная сводка execution обязательна при наличии запуска                                               |
| Done                                         | Обязательные результаты исполнения сданы долговечно; может ожидаться тестирование/приёмка, что явно отображается                                 |
| Closed / принято                             | Все обязательные критерии, проверки и решение принимающего действуют для текущих revisions; включая deploy, если он входит в критерии            |
| Обязательный failed check                    | Возврат в Active/исправление; переход в Closed / принято отклоняется                                                                             |
| Изменение принятого результата или критериев | Старое acceptance остаётся историческим; текущая приёмка требует пересмотра, задача возвращается в Active и не остаётся принятой по старому hash |
| Закрытие с исключением                       | Только отдельное разрешённое решение с причиной и verdict; не равно accepted и не удовлетворяет зависимость, требующую успешной приёмки          |

Настраиваемый список статусов должен иметь выбранный статус возврата для Active.
Отмена/архив не подменяют успешную приёмку и не освобождают зависимые работы как success.

## 6. Планировщик, очередь и ресурсы

### 6.1. Readiness и одна передача исполнения

Backlog может содержать неготовые задачи. В рабочую очередь попадает этап,
для которого есть scope, назначения, допустимая конфигурация, доступный тип
исполнителя, необходимые approvals и выполненные зависимости.
Занятый, но работоспособный provider — причина ожидания ресурса.
Отсутствующий adapter/credential/capability — блокер подготовки.

Повторная проверка выполняется при claim и перед side effect. Изменение ACL,
конфигурации или срока действия approval во время ожидания останавливает выдачу.
В UI видны причина и время ожидания; точная позиция показывается только там,
где scheduler способен гарантировать порядок.

До submit authoritative запись планирования принадлежит task orchestration.
После submit фактический job принадлежит очереди исходного runtime; задача
показывает её проекцию. Два независимых consumer не claim-ят одну и ту же работу.
Для шагов внутри уже принятого workflow scheduling и переходы принадлежат
его единственному engine; task scheduler не ведёт второй исполняемый граф.

### 6.2. Приоритеты и зависимости

План — ациклический граф этапов и версионированных входов. Есть блокировки
по результату, approval, материалу, времени и ресурсу. Граф task dependencies
и граф этапов проверяются на циклы и недоступные ссылки.

Related-связи не входят в этот граф и не меняют readiness. Изменение depends_on
атомарно проверяет self/cycle, текущую graph revision и права обеих сторон,
включая разные проекты. Две конкурентные противоположные зависимости не могут
обе пройти проверку по устаревшему графу. Учитываются также обязательные
parent/child условия приёмки, чтобы ребёнок не ждал результата родителя,
который сам требует завершения ребёнка.

Предикат готовности ссылается на конкретный результат/этап/артефакт, а не
только изменяемое отображаемое имя статуса. Отмена/удаление predecessor,
отзыв приёмки или утрата права на проверку дают blocker. Изменение графа
пересчитывает ещё не выданные назначения; для активных attempts требуется
отдельное согласование перехода/остановки у owner. Повторные события освобождения
dependency имеют одну idempotent активацию. Снятие зависимости не отменяет
остальные ограничения, режим запуска или policy approvals.

Порядок среди подходящих этапов: заданный priority, затем время готовности;
aging/доля ресурсов защищают низкий приоритет от бесконечного вытеснения.
Ручная перестановка применяется внутри совместимого resource pool.
Запущенный этап не отнимается у worker лишь из-за новой срочной задачи.

Fan-out создаёт разные assignments/attempts. Fan-in проверяет выбранное правило
всех обязательных результатов/quorum/ведущего и их revisions.
Отказ обязательного участника блокирует зависимые этапы; уже успешные результаты
сохраняются. Политика отмены остальных веток задаётся явно, не скрыта в UI.

TaskExecutionPlan связывает назначения с шагами workflows; саму семантику
workflow и parallel/join надо расширить у существующего AI owner. Не создаётся
второй несовместимый engine с копиями тех же definition/checkpoint.

### 6.3. Capacity, конфликтующие записи и бюджеты

Раздельные лимиты: host, provider connection, worker pool, команда, агент,
задача/этап и внешний сервис. До реализации расширенной capacity нынешнее
Codex-подключение предоставляет один совместный слот для runtime/auth/review.
UI показывает несколько назначений, но не выдумывает параллельное исполнение.

Кодовые assignments получают изолированные worktrees и фиксированный base.
Объединение результатов — отдельный контролируемый этап с проверкой конфликтов,
build/tests/review. Общие schema/migration/deploy и пересекающиеся write scopes
сериализуются. Локальный TASK.md досье не редактируется несколькими исполнителями
одновременно; отдельные результаты публикуются по assignment.

Лимиты: время ожидания, wall-clock исполнения, число шагов/попыток, параллельность,
объём контекста/файлов. Токены и стоимость ограничиваются только при наличии
достоверных метрик и механизма исполнения лимита. Неизвестная цена обозначается
как неизвестная; факт не смешивается с оценкой. Для жёсткого token limit нужен
резерв и enforcement адаптера; без них функция не объявляется поддержанной.

Предлагаемые начальные параметры для испытаний: heartbeat 30 секунд, stale 90
секунд, ожидание готового этапа до 5 минут. До submit истечение queue deadline
атомарно запрещает dispatch и даёт blocked. После submit deadline должен
проверяться authoritative job при claim/перед эффектом либо применяться через
подтверждённую отмену у owner. До выяснения исхода — cancel_requested или
recovery_required; смена только task-проекции не останавливает старый job.
Гонка timeout/claim разрешается исходным владельцем и отражается правдиво. Deadline исполнения
зависит от вида работы и фиксируется в плане. Ожидание человека и scheduled
задачи имеют отдельную политику; таймер worker lease к ним не применяется.

### 6.4. Lease, cancel и восстановление

Claim выдаёт attempt ID, lease expiry и монотонный fencing token. Запись от
старого владельца после перевыдачи отвергается. Durable worker state и source
runtime согласуются до разрешения новой попытки.

Pause останавливает выдачу следующих этапов; текущий останавливается только
там, где это поддерживается. Cancel сначала сохраняет намерение, затем передаёт
его владельцу процесса; недоступный runtime не превращает запрос в ложный success.
Отмена не откатывает публикацию, merge или миграцию.

При рестарте dispatcher перечитывает незавершённые dispatch/attempts и сверяет
runtime IDs, checkpoint и effects. Потеря heartbeat сама по себе не даёт права
дублировать необратимую операцию. Без подтверждения безопасного повтора —
recovery_required и конкретный план действий.

Согласованный порядок продолжения одной попытки определяет, когда чтение
попадает в покрытие и на каком шаге безопасен рестарт.
[Контрольные точки и подтверждённые чтения](task-management/execution/checkpoints-and-reads.md)

## 7. Работа без браузера и командный доступ

Server-owned ingestion постоянно получает/восстанавливает события runtime,
фиксирует итог и двигает workflow/план. Browser SSE только читает durable события.
Закрытие вкладки, смена маршрута или отсутствие наблюдателей не управляют
продолжением задачи. In-memory состояние provider wrapper не является
единственным источником результата.

Для назначения агенту сервер хранит scoped delegation: кто разрешил, какие
task/resources/actions, срок и способ отзыва. Права проверяются при dispatch
и перед записью. Удаление пользователя/отзыв делегации прекращает новые действия;
состояние текущей операции выясняется без притворного переноса авторства.

Task membership не открывает весь личный chat, CR или run другого владельца.
Допустимы только явно разрешённое совместное владение либо безопасная scoped
проекция task-linked результатов через owner API. Скрытые части остаются
закрытыми. Политика должна охватывать deep links, attachments, events и counts,
а не только экран карточки.

История содержит фактического агента и человеческий/сервисный источник делегации.
AI-task approval и человеческий release approval различаются. Имена task roles,
profiles и modes не заменяют hash-bound approval, sandbox или host authorization.

### 7.1. TaskConversationLink и история обсуждений

Link имеет ID/revision, taskId, conversationId, purpose, набор message/run
references, linkedBy/linkedAt и active/unlinked state. Уникальность задаётся
в пределах `(taskId, conversationId, purpose)`; повтор команды не дублирует
link/уведомления. Добавление anchors проверяет принадлежность сообщений
указанному conversation и связь run с этими сообщениями. Саму историю диалога
task module не копирует в собственную параллельную messages collection.

Создание из диалога сохраняет source link вместе с Task либо через durable
outbox без необъяснимой потери происхождения. Для последующих сообщений
используется явный task context; у диалога может быть несколько активных task
links, но каждый turn получает конкретный разрешённый набор task IDs.
TaskRun receipt дополняет link, а не заменяет many-to-many связь обсуждений.

Link/read/unlink проходят права task и conversation owner. Выдача названия,
участников, anchors, snippets, counts и attachments фильтруется по реальному
доступу. Расшаривание разрешённой сводки в задачу является явной публикацией
такого материала; простая ссылка не делает весь диалог общим. Отзыв доступа
применяется и к прежним links/кэшу/SSE, не только к новым запросам.

Unlink сохраняет ACL-защищённый audit и старые source references у attempts
и artifacts; удаление conversation не каскадно удаляет Task/Handoff/результаты.
Retention удалённого текста соблюдается: ссылка происхождения не восстанавливает
сам текст и не подменяет его несогласованной копией. При transfer получатель
читает только явно разрешённый контекст; исходный личный диалог остаётся закрытым.

## 8. Артефакты, TASK.md и источники истины

| Данные                                                                                                      | Источник истины                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Проекты, задачи, назначения/handoff, task relations/conversation links, декларативный план, доступ, приёмка | Payload task domain и версии сущностей                                                                                                      |
| Диалоги, сообщения и исходные message/run relationships                                                     | Существующий conversation owner; task хранит ссылки и разрешённый контекст                                                                  |
| Переходы workflow, fan-out/join, текущий этап                                                               | Единственный workflow engine; task UI читает проекцию                                                                                       |
| Конфигурация AI                                                                                             | Существующий AI-layer release/compiler                                                                                                      |
| Фактический run/job/checkpoint/effect                                                                       | Исходный runtime owner; task хранит refs и восстанавливаемые projections                                                                    |
| Метаданные файлов, revisions, hashes и права                                                                | Task artifact catalog                                                                                                                       |
| Бинарное содержимое                                                                                         | Закрытый storage adapter с контролируемой выдачей                                                                                           |
| Локальный workspace                                                                                         | Несвязанный резерв — TASK.md по §8.1; после связи предметный owner — Task API, старый снимок сохранён; полный file cutover остаётся целевым |
| Native agent session/SQLite registry                                                                        | Собственный runtime инструментов; в task dossier только разрешённые ссылки/сводки                                                           |

Каждая попытка принадлежит этапу исполнения и ревизии назначения. С этой попыткой
связаны предметные события и опубликованный результат. Для процесса независимого
ревью на отдельной PostgreSQL проверены восстановление попытки, публикация отчёта
и карты покрытия в досье и выдача их версий назначенному ревьюеру.
[Связи задачи, исполнения, этапа и назначения](task-management/execution/attempts-and-dossier.md#от-задачи-до-фактического-запуска) ·
[Хранилище контрольных точек](task-management/execution/checkpoint-storage.md) ·
[Публикация и выдача работы](task-management/execution/audit-report-publication.md) ·
[Заключение и решение о приёмке](task-management/execution/review-conclusion.md) ·
[Доработка и повторная приёмка](task-management/execution/review-rework.md)

Artifact metadata: ID/revision, category, filename, MIME, bytes, content hash,
storage key, author, task/execution/stage/attempt, createdAt, provenance,
input/output purpose, retention/pinned, upload/ready/rejected/deleted state.
URL/скачивание проверяют ACL; private files не попадают в публичную Media.

Локальному исполнителю выдаётся manifest выбранных файлов с hashes и целевыми
именами. Paths проверяются на traversal/symlink escape и границы assignment.
Публикация результатов проходит через artifact API с expectedRevision и
idempotency. Большие файлы загружаются потоково/частями по контракту storage.

Новая задача прежде всего создаётся в Task Manager (§8.3). Серверное создание
не создаёт локальный TASK или каталог артефактов. Локальный резерв допускается
при отсутствии настройки платформы или доказанной недоступности до отправки
создания. После подтверждённого полного cutover TASK.md становится читаемой проекцией ревизии
задания, критериев, результатов и handoff. Статус тогда меняется командой task
API; правка markdown сама по себе его не меняет. Несвязанный локальный резерв
имеет один источник состояния — frontmatter `TASK.md` под управлением §8.1.
После intake сервер владеет предметной задачей, прежний локальный снимок
сохраняется без синхронизации и доступен только для чтения через CLI.
Существующие локальные TASK.md не перезаписываются автосинхронизацией.
Импорт папки — явная операция с preview, hash manifest, сопоставлением
категорий и исторических участников. Импорт материалов не возобновляет старый run.

Экспорт включает задачи/назначения/связи/версии/evidence и manifest файлов.
Если он используется для удаления с последующим восстановлением, обязательна
проверка round-trip с сопоставлением пользователей и внешних IDs.
Иначе экспорт не заменяет резервную копию БД и storage.

Retained результаты и audit не наследуют срок очистки tmp. Ссылки из scheduled,
queued, running, paused, recovery_required и остальных незавершённых executions,
ожидающих тестирования/приёмки результатов, принятых и зависимых задач удерживают
нужные artifact revisions. Создание удержания и очистка согласованы атомарно;
GC повторно проверяет ссылки перед удалением. Внешняя очистка storage выявляется
как недоступный материал, без подмены файла. Локальное правило «30 дней —
кандидат на очистку» не является автоматическим удалением продуктового досье.

### 8.1. Реализованный локальный lifecycle (2026-10-15)

Этот подраздел описывает несвязанный локальный резерв. Создание прежде всего
на сервере, условия fallback и передача владения добавлены в §8.3.

Owner CLI — `.ai/tools/task-workspace`, вход — `npm run task:workspace --`.
Внутренние владельцы разделены на `cli`, `dossier`, `artifacts`, `producer-group`,
`cleanup`, `recovery`, `filesystem` и `consumers`; их границы и команды проверок описаны в
[README инструмента](../../.ai/tools/task-workspace/README.md#структура-инструмента).
Публичный вход producer-группы — `src/producer-group/workspaceProducerGroup.index.mjs`
относительно этого owner.
Публичные schemas принадлежат export
`@realize/payload-task-manager/workspace-contracts`; текущий серверный Foundation
из §12 продолжает использовать `backlog/in_progress/review`. Категории
локального досье `open/active/done/closed`, приёмка, outcome, archive и execution
projection не добавляют серверные поля, routes или CRUD-команды.

Этот lifecycle относится к управляемому досье. Короткая самостоятельная операция
может иметь только необходимые служебные файлы, без TASK, artifact-manifest
и result; выбор маршрута принадлежит
[правилу материалов](../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md#выбор-рабочего-контекста).
В частности, обычный add/commit/push сохраняет обязательный Git-воркер и журнал
операции, но не требует отдельного управляемого досье или его закрытия/архива.
Наличие `tasks/<taskId>/` у инструмента само по себе не включает этот lifecycle.

CLI явно выполняет `create`, `sync`, `adopt`, `inspect`, `status`, `result`, `register`, `settle`,
`plan-cleanup`, `cleanup`, `archive`, `reopen`, `recover`. Мутация versioned досье
требует `--expected-revision`; сложный вход передаётся как JSON через `--input`.
`create` принимает `--task`, `--title`, `--body-file`, повторяемый
`--required-check` и optional `--acceptance-required`/`--delivery-required`.
Существующие legacy TASK не преобразуются автоматически: `adopt` требует
явного состояния и сохраняет поясняющий body.
Его CLI требует `--category open|active`; `settle` завершает выбранные
`artifactIds` через JSON input. `plan-cleanup` принимает optional
`{paths: string[]}` и `--output logs/<file>.json`; `cleanup --plan` без
`--apply` показывает сохранённый план и не выполняет purge.
Локальный filesystem adapter требует Linux и GNU `mv` с атомарным переносом
без overwrite/copy-delete; это не заявление о переносимости CLI на все hosts.

`TASK.md` версии `schemaVersion: 1` содержит UUID `localDossierId`, стабильный
`localKey`, revision/даты, `status: {id, category}`, отдельные execution
`state/runtimeRef/stageId/attemptId`, acceptance, delivery, outcome и
`archivedAt`. Состояние задачи не выдаётся за состояние процесса. Регистрация
в `artifact-manifest.json` фиксирует artifact IDs/revisions/hashes и retention;
result manifests сохраняются в `logs/results/`. Intake §8.3 передаёт начальную
постановку; эти локальные lifecycle/artifact поля не синхронизируются с API.
Локальный `criteriaHash` фиксирует body `TASK.md` целиком; его изменение требует
нового result manifest и актуальной обязательной приёмки.
Причина отмены допустима только с `outcome: cancelled`; окончательное body,
включая причину, проверяется до записи и ограничено 512 KiB UTF-8.
Managed manifest обязателен: его отсутствие, повреждение или чужой владелец
не трактуются как отсутствие артефактов. Начальная пара создаётся отдельной
инициализацией create/adopt без перезаписи частично существующего состояния.
Переход в локальный Done требует `passed` обязательных checks; evidence
принадлежит registered retained artifact, включённому в result refs.
Физические hashes/bytes и quiescence producers сверяются повторно. Несколько
checks и refs одного дерева используют один снимок только внутри одной
синхронной неизменной фазы проверки evidence. Контекст закрывается до записи;
следующая фаза и разрушительные действия получают свежую проверку.

CLI принимает файловый JSON либо один JSON через `--input -` с пределом 1 MiB.
Отдельный `--compact` возвращает краткий ответ с известной ревизией, исходом,
ошибкой и ссылками результата/восстановления, без дополнительных чтений;
неизвестные значения обозначены явно. Полный ответ остаётся по умолчанию,
`--output` сохраняет назначение пути плана. Обычная сдача отчёта и доказательств
без конфликта использует два дерева, три мутации register → settle → result
и необходимые inspect; отдельные входные JSON-файлы при stdin не создаются.

Cleanup работает только с зарегистрированными временными артефактами внутри
task `tmp/`. Retain/pinned/referenced материалы, открытый producer и активное
execution удерживают файлы. `plan-cleanup` предшествует
`cleanup --plan <file> --apply`; применяются exact reviewed revisions/hashes,
evidence сохраняется до purge. Артефакты вне области, включая `.next`, корневой
`node_modules`, пользовательские данные и runtime stores, не затрагиваются.
Producer PID связывается с identity (`bootId`, `startTicks`), чтобы не принять
другой процесс с тем же PID за владельца записи; завершение producer выполняет
явный `settle`. Symlink ancestors и корень artifact tree закрыты;
terminal symlink внутри зарегистрированного tree допускает сверку самой ссылки
и unlink без обхода её target.
Source references и process refs имеют bounded coverage; process metadata
ограничены доступными same-UID `cwd/exe/fd/pathname argv`, без чтения environment.
Внешние service consumers требуют отдельной сверки владельцем очистки.
Поиск исходников включает `tests/`, различает точный путь/потомка и соседнее имя;
превышение бюджета файлов или размера поддержанного файла блокирует проверку.
При move собственные относительные Markdown-ссылки оцениваются из назначения:
переносимая ссылка разрешена, оставшаяся в старом source — удерживает досье.

Служебные result, cleanup plan и receipt проверяют пересечение с registered
ready trees в обоих направлениях. Прямые сервисы применяют guard до записи
и разрушительного действия; разрешены непересекающиеся соседние файлы.
Собственный producer пишет выделенные outputs между begin и settle, без общего
разрешения служебным операциям изменять чужие unsettled trees. Browser fixture
заранее регистрирует отдельную группу квитанции и перед записью проверяет
владение её открытым деревом (§8.2).

Все локальные мутации используют один контекст и durable prepared journal
до первого эффекта. Pending по ключу блокирует другие мутации и новый план;
`recover --task <key> --operation <id>` продолжает сохранённые входы и достижимые
фазы. TASK/manifest записываются по точным before/after с курсором; чужая правка
не считается допустимым промежуточным состоянием. Завершённый ID возвращает
сохранённый результат; смена параметров под тем же ID отклоняется. Журнал
завершения сохраняется до снятия pending. `inspect` показывает ссылки и фазу,
не содержимое журнала, и доступен при частичной инициализации.

Прежние журналы индексируются с возобновляемой стадией building → ready,
сохраняя пути и формат. В штатной работе читаются только данные своего ключа.
Старый cleanup без planPath требует явного оригинального `cleanup --plan … --apply`
с проверкой requestId/hash/identity. Ограничения, порядок блокировок, fsync и
переход со старых writers описаны в [протоколе owner](../../.ai/tools/task-workspace/README.md#план-очистки-и-восстановление).

Archive переносит только closed/quiescent досье с сохранённым evidence в
`.ai-workspace/history/<localKey>/`. Перемещение не означает `accepted`;
cancelled требует отдельного outcome и причины. Reopen сохраняет прежние
result manifests, а прошлые metadata/решения — в приватном local recovery
journal инструмента; серверный acceptance audit этим срезом не реализован.
Reopen не перезапускает runtime. CLI не запускает, не ставит в очередь
и не восстанавливает агентов; producer-каталог может иметь привязку к attempt,
но lifecycle исполняется явными командами владельца этапа. Автоматический
interceptor всех существующих build/test scripts не реализован.

Точный command contract и проверки находятся в
[CLI README](../../.ai/tools/task-workspace/README.md), поведение рабочего
агента — в [правиле рабочей области](../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md),
вход создания — в [шаблоне TASK](../../.ai/templates/task-workspace/TEMPLATE-TASK.md).

### 8.2. Producer lifecycle Task Manager browser fixture (2026-10-15)

Первый подключённый consumer — `tests/e2e/support/runTaskManagerAcceptance.fixture.ts`.
Fixture требует `TASK_BROWSER_TASK=.ai-workspace/tasks/<localKey>` существующего
managed open/active/done досье: историческая Foundation-задача не подставляется,
legacy не принимается без явного adopt. Короткий случайный run ID именует
каталоги, отдельный UUID связывает artifacts с attempt.

До запуска ресурсов owner `.ai/tools/task-workspace` сначала создаёт и регистрирует
retained+pinned unsettled группу `logs/task-browser-<runId>-lifecycle/`, затем
основную unsettled группу `logs/task-browser-<runId>`, `screenshots/task-browser-<runId>`
и `tmp/task-browser-<runId>`. Только после обеих регистраций разрешён запуск БД,
browser и остальных ресурсов. После browser success, failure или interruption
fixture завершает собственные process groups, закрывает streams и временную БД,
повторно подтверждает quiescence после закрытия всех sibling/DB ресурсов,
затем восстанавливает только добавленные ею Next includes и собственный generated
`next-env.d.ts` pointer через штатный Next generator, сохраняя чужие изменения.
Outcome и resource cleanup сохраняются в `fixture-result.json` внутри logs.

После финализации основной группы квитанция записывается в
`logs/task-browser-<runId>-lifecycle/receipt.json`, пока её собственная группа
открыта; затем группа квитанции завершается без temporary cleanup. Лимит manifest
остаётся 1024: при 1021 прежней записи основная группа получает ранний отказ
до ресурсов, при 1020 помещаются все четыре артефакта. Конкурентная регистрация
также может вызвать ранний отказ основной группы, но место квитанции уже занято.
Файл квитанции сохраняет состояние до её собственного settle; после settle его
bytes не меняются. Возвращаемый результат отдельно показывает итог квитанции
completed/open/unwritten/unknown, подтверждение записи, writers и settlement.

Подтверждённая quiescence разрешает settle и exact cleanup только собственного
temporary tree через existing guards. Logs/screenshots и отдельный lifecycle
receipt удерживаются; статус, result и archive родительской задачи не меняются.
Неоднозначное владение процессом, незакрытый ресурс или конфликт generated
inputs сохраняют tmp и blocked outcome. Новые посторонние same-UID процессы
могут консервативно удержать cleanup; fixture не отправляет им сигналы.
Root `next-env.d.ts` учитывается как source consumer временных Next types.
Нестандартный исходный generated файл отклоняется до запуска Next;
query-переопределения PostgreSQL host/hostaddr не проходят loopback admission.

Для отдельного supervised запуска `TASK_BROWSER_SUPERVISOR_UNIT` может указать
свой dedicated transient user-systemd unit `realize-fixture-task-browser-*.service`.
Опциональный transport проверяет реальную cgroup, `Transient=yes`, `Delegate=no`
и identity/ancestry MainPID до запуска и перед действиями. После закрытия children
и БД он завершает оставшиеся writers только внутри подтверждённой cgroup,
исключая fixture и цепочку её wrapper ancestors, затем повторяет quiescence.
Новые процессы вне этой области не получают сигналов и не считаются её writers.
Недоступная или изменившаяся принадлежность удерживает artifacts; без explicit
unit остаётся консервативный same-UID baseline. Это transport тестового job,
а не launcher Task API или замена статуса родительской задачи.

Begin и finalize входят в тот же протокол мутаций. Подготовленный finalize
содержит settle, точный файл плана и cleanup; blocked возвращает ссылку исходной
операции, повтор не создаёт другой план. Recovery не восстанавливает process-local
handle: после потери процесса требуется явное завершение по проверенным artifact IDs.
Если mkdir успел создать каталог, но процесс не сохранил его inode, исход остаётся
`producer_directory_outcome_unknown`: каталог сохраняется для разбора, а не
присваивается повторному вызову. Pending не разрешает новый register/settle;
допустима лишь диагностика владельца внутри уже открытого собственного producer.
Квитанция при этом остаётся retained+pinned+unsettled, TASK/manifest не меняются.
Отказ основной группы без pending допускает завершение отдельной квитанции при
подтверждённой остановке её собственных writers; blocked основной группы сохраняется,
даже если квитанция описывает неудачную остановку основных ресурсов. Если writers
самой квитанции не подтверждены, запись и завершение откладываются явно.
Её назначенный writer — синхронный координатор; путь квитанции не передаётся
дочерним ресурсам. Найденные ссылки процесса на каталог блокируют запись;
недоступные посторонние `/proc`-записи учитываются как ограничение покрытия,
а не как найденный writer. `writerCoverage` в квитанции и возвращаемом результате
сохраняет область проверки, число ссылок и недоступных записей.

Привязка handle охватывает identity досье и собственные artifact IDs/записи,
а не глобальные ревизии на время жизни группы. Изменения другой группы не
инвалидируют её; собственные записи сверяются под lock. После settle привязка
обновляется только по подтверждённому сохранённому переходу. При частичной операции
сначала проверяется её исходный journal, чтобы не принять собственный settle за
чужую правку. Неподтверждённое состояние не обновляет привязку.

Результат `WorkspaceProducerGroupFinalization` — явное объединение completed/blocked.
Completed cleanup требует `WorkspaceCleanupReceipt` с requestId, status, paths,
estimatedAllocatedBytes и completedAt. Blocked содержит reason, settlement, phase
и nullable operation; неизвестное состояние обозначается явно как unknown.
Сохранённая квитанция и результат fixture используют конкретные типы.

Программа producer group работает в одном процессе с оригинальным handle;
она не заменяет durable process ownership и не перехватывает остальные scripts.
Contracts/owner tests — `npm run check:task-workspace`, orchestration и реальные
process guards — `npm run check:task-fixture`. Синхронизация с Task API остаётся
отдельным последующим шагом.

### 8.3. Создание через Task Manager и локальный резерв (2026-10-19)

`task:workspace create` выбирает Task Manager основным источником новой задачи.
При успешном intake из §12.4 локальный TASK и artifact manifest не создаются.
Служебная привязка CLI хранит стабильный `clientTaskId`, неизменяемый вход,
состояние доставки и `taskRef`; это транспортная запись, не второе досье.
`inspect` читает её без сети и показывает прежний локальный снимок отдельно,
если он появился при fallback. Статус команды не означает приёмку задачи.

Подключение использует browser `login` и Linux Secret Service по
[контракту доступов](../architecture/platform-access.md) либо явные
`REALIZE_TASK_MANAGER_URL` и `REALIZE_TASK_MANAGER_TOKEN` (scoped token или user JWT). Прежние
`REALIZE_TASK_MANAGER_PROJECT_ID`/`REALIZE_TASK_MANAGER_LIST_ID` игнорируются.
При настроенном подключении новый `create` требует `--project <UUID>` до сети;
`--list <UUID>` можно опустить
только при единственном списке без следующей страницы. Отсутствующий проект
или неоднозначный список не разрешают fallback. Credentials берутся из keyring или окружения и
не сохраняются в задачах, журнале или ответе. Полное отсутствие подключения
даёт локальный резерв `not_configured`; частичная/неверная конфигурация требует
исправления, не обхода через локальный TASK.

При ненастроенном подключении резерв может не иметь выбора; переданные selectors
сохраняются для этой задачи. При настроенном, но недоступном соединении fallback
сохраняет выбранный project. Для новой задачи `--list` требует `--project`; поздний `sync`
может дополнить недостающие значения, но не заменить известный project, list
или API base URL. Без выбора резерв остаётся доступным для локальной работы
и требует явного `sync` с selectors. Pending/remote retry сохраняет прежний
target и точный payload. Journal v2 читает v1 через преобразование в памяти,
не переписывая его при `inspect` и не меняя прежние createHash/pending payload.

До первого POST read-only проверка `GET /api/task-manager/projects` отделяет
недоступность платформы от неизвестного исхода записи. Отказ соединения до
передачи запроса, timeout предварительного чтения и HTTP 502/503/504 на нём
допускают fallback. HTTP 401/403/404/409/429, validation и ошибки credentials
не допускают его. После возможной передачи POST timeout/reset/5xx сохраняют
pending и требуют точного повтора тем же UUID; последующий offline не разрешает
создать вторую задачу. Матрица ошибок принадлежит
[CLI](../../.ai/tools/task-workspace/README.md#task-manager-и-локальный-резерв).

`sync --task <localKey>` явно передаёт managed локальную задачу или повторяет
pending intake. Старый legacy сначала принимается через явный `adopt`;
автоматического поиска/import всех TASK нет. Уже выбранный локальный резерв
повторяет доставку перед следующей CLI mutation при полном подключении
и сохранённом выборе. При отсутствии проекта автоматическая передача
откладывается с `remote_selection_required`, при неоднозначном списке —
с `remote_list_required`, без блокировки локального редактирования.
Online `create` и явный `sync` требуют исправить выбор.
При успехе mutation останавливается с `remote_owned`; предметный owner теперь
сервер. Проверяющего daemon или фоновой синхронизации нет.
`sync` фиксирует snapshot под task lock и не требует `--expected-revision`.
Активное execution или producers откладывают автоматическую передачу с
`remote_sync_deferred_active_work`, позволяя завершить локальную работу;
явный `sync` отклоняется. `recover` и просмотр cleanup без `--apply` не запускают
автоматическую доставку.

Подтверждённая связь блокирует локальные мутации, включая прямые services.
Прежний TASK и артефакты сохраняются без переписывания и очистки. Intake
передаёт только начальную постановку, не history, files, checks, результаты
или acceptance. Foundation остаётся `backlog/in_progress/review`;
локальные `done/closed` не отображаются как серверная приёмка. Полная
проекция lifecycle, artifact access и проверяемый перенос файлов из
[продуктового §15](task-management.md#15-разработка-платформы-git-и-переход-к-постоянным-задачам)
остаются последующими этапами.

## 9. Нефункциональные требования и миграции

- Все mutation paths имеют validation, ACL, revision/idempotency и audit.
  Комментарии/события/уведомления фиксируются атомарно либо через durable outbox.
- Поиск, ленты, деревья и файлы пагинируются. В UI не загружаются все runs/logs.
  Indexes выбираются по фактическим queries, а не только по структуре коллекций.
- Целевой нагрузочный профиль для согласования: 100 пользователей, 10 000 задач,
  100 000 событий, 20 активных UI-сессий; стенд 4 vCPU/8 GB и БД в одной сети.
  p95 list/detail API ≤500 мс, task mutation ≤800 мс, исключая provider latency.
  Метрики не являются результатом уже проведённого теста.
- Durable event должен появиться у подключённого наблюдателя в пределах
  согласованного SLO; предложение — p95 ≤5 секунд при нормальной связи.
  После разрыва связь восстанавливается с cursor без потерянных событий.
- Локали RU/EN, обе темы, клавиатура и доступные альтернативы drag-and-drop.
  Конфликт/ошибка не уничтожают ввод; секреты и private prompt не попадают в logs.
- Перед выпуском фиксируются limits для hierarchy depth, upload, context,
  fan-out, retention и budgets; достигнутый лимит объясняется в интерфейсе.
- Миграции учитывают полную host schema, namespace и выбранный DB adapter.
  Выпуск AI runtime/adapter/task package имеет проверенную compatibility matrix.
- Upgrade проверяется на активной очереди: drain или совместимая миграция;
  старые attempts/snapshots продолжают читаться, новые dispatch временно закрыты
  при несовместимом runtime. Скрытого schema push/onInit upgrade нет.
- Disable закрывает новые dispatch и операции по политике; активные попытки
  завершаются/останавливаются явно. Uninstall не удаляет данные автоматически;
  retention/recovery следует [контракту расширений](extension-management.md#6-операции-и-сохранность-данных).

## 10. Приёмочные проверки

| ID    | Сценарий и доказательство                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EX-01 | Два одновременных старта одной ревизии возвращают одно execution/dispatch; для каждой разрешённой ветки ровно один исходный run/job                                   |
| EX-02 | Ответ submit потерян после создания run: lookup/reconcile находит его, повторное исполнение не появляется                                                             |
| EX-03 | Вкладка закрыта до terminal event: очередь, история и последующие разрешённые этапы продолжаются без browser SSE                                                      |
| EX-04 | Рестарт dispatcher/CP/worker в разных фазах: состояние восстановлено либо явно recovery_required, без ложного успеха                                                  |
| EX-05 | Старый worker пишет после истечения/передачи lease: fencing отвергает результат, новый владелец не дублирует side effect                                              |
| EX-06 | Занятый Codex: задания честно ждут один слот; разные агенты не обходят общий connection lock                                                                          |
| EX-07 | Несуществующая capability, потерянный credential или stale heartbeat: actionable blocker до dispatch                                                                  |
| EX-08 | Приоритеты, aging, DAG, fan-out/fan-in и partial failure проверены серверными сценариями; нет starvation/циклов                                                       |
| EX-09 | Два code assignments с пересечением scope: изоляция/сериализация; объединение повторно проходит checks/review                                                         |
| EX-10 | Профиль/команда/task revision изменены в очереди: план пересматривается; старый attempt хранит исходный snapshot                                                      |
| EX-11 | Назначенный profile/model действительно дошёл до поддерживаемого runtime lane; неподдержанный выбор отклонён, не проигнорирован                                       |
| EX-12 | Отзыв ACL/delegation закрывает dispatch/read/write; членство задачи не раскрывает чужой личный чат или артефакт                                                       |
| EX-13 | Pause/cancel в очереди, во время turn и внешнего write имеют разные правдивые исходы; retry не отменяет прошлый audit                                                 |
| EX-14 | Artifact заменён после test/acceptance: старый verdict не распространяется на новый hash; зависимый план требует проверки                                             |
| EX-15 | Повторные/переставленные events не создают дублей и не откатывают state; уведомления не образуют цикл observer agents                                                 |
| EX-16 | Импорт/экспорт, archive/restore и upgrade проверены на данных и внешних IDs; tmp cleanup не удаляет принятые результаты                                               |
| EX-17 | npm archive установлен в независимый host; task-domain и полный AI adapter проверены как разные compatibility profiles                                                |
| EX-18 | Сценарий человек/агенты на всех ролях проходит из Admin Assistant до принятого результата с досье и фактическими runs                                                 |
| EX-19 | Timeout одновременно с claim: authoritative job не выполняет просроченный эффект либо обнаруженный начавшийся исход честно проходит cancel/recovery                   |
| EX-20 | Падение при публикации blob/manifest: нет ложного succeeded/fan-in; публикация восстановлена, используемые версии удержаны от GC                                      |
| EX-21 | Агент → человек → агент: сдача новой ручной версии двигает тот же workflow и сохраняет авторство; provider не требуется ручному этапу                                 |
| EX-22 | Done/Closed и исключения одинаково проверяются во всех API/UI; изменение criteria/result не сохраняет принятие по старой версии                                       |
| EX-23 | Many-to-many task/conversation, разные ACL, unlink и удаление источника: обратные ссылки корректны, закрытые данные не раскрыты, происхождение результата не потеряно |
| EX-24 | Конкурентное добавление A→B/B→A между проектами: один запрос отклонён; related допускает цикл и не блокирует scheduler                                                |
| EX-25 | Повтор/гонка handoff с claim/result: один переход назначений, старый attempt не пишет от имени нового и не дублирует side effect; decline сохраняет ответственного    |
| EX-26 | Делегирование соисполнителю/цепочке агентов: scope и budget не растут, независимые части работают параллельно, fan-in ждёт нужные revisions                           |
| EX-27 | Project/list/parent consistency проверена через UI/API/import; перенос/архив с активными runs не меняет их scope молча, ACL и весь перенос дерева согласованы         |

До реализации по каждому GAP назначаются владелец, контракты, миграции и
проверки. Это часть инженерной декомпозиции после принятия ТЗ/референсов.
До выполнения EX-03/04 нельзя объявлять автономную очередь готовой.
До выполнения EX-11 нельзя объявлять task bindings фактически применяемыми.

## 11. Командная модель второго frontend-среза

Это локальная демонстрация раздела 12.2 продуктового ТЗ, без Payload writes,
Git-команд, сети и реальных agent runs. Один store на экземпляр workbench
хранится в памяти; перезагрузка или reset восстанавливает fixtures.

`TaskDraft` содержит все редактируемые поля, четыре роли, соисполнителей,
родителя, связи/диалоги, отдельные criteria, несколько checklists и Git links.
`task/create` и `task/save` проверяют весь draft до изменения state; создание
задачи и симметричных related-связей атомарно. При отказе задачи, очередь,
материалы и история не меняются. `CommandResult` возвращает `ok`, `message`,
успешный `taskId` и ошибки по полям; форма закрывается только после успеха.
`useSyncExternalStore` подписывает все представления на один immutable snapshot.

У checklist-пункта есть стабильный ID, текст, done, assigneeId, dueDate и
required. Criteria остаются отдельными критериями приёмки. Незавершённые
criteria, обязательные checklist-пункты и неархивные дети блокируют принятие.
При редактировании принятой задачи сначала требуется переоткрытие. Parent
остаётся в том же проекте; дерево и dependencies не допускают циклов.

Git links принимают только URL http(s) без credentials. Ручные ссылки имеют
source=manual/status=unverified; правка ссылки не создаёт provider receipt.
source=demo допустим только для явно обозначенных демонстрационных примеров.
Branch/commit/push/PR/build/release — типы связей, а не команды исполнения.

Duplicate создаёт новый backlog без выполненных пунктов, run, handoff и
принятого результата. Archive не допускает активных queued/blocked/running/
paused запросов; родитель архивируется только с уже архивными детьми либо
вместе с ними одной проверенной bulk-командой. Restore требует активного parent
или восстановления всей выбранной цепочки. Bulk применяет те же инварианты
атомарно; частичный успех не маскируется общим сообщением.

Активная зависимая работа также препятствует архивированию своей предпосылки;
их можно архивировать одной bulk-командой. Незавершённую архивную задачу нельзя
назначить новой зависимостью. Копия не наследует Git-ссылки на результаты
исходной задачи; постановка, назначения, связи с контекстом и незавершённые
пункты сохраняются. История копии начинается с события копирования, её досье —
с нового `TASK.md`.

Владелец команд — локальная модель `src/components/admin/task-manager/reference`:
reducer публикует либо целую рабочую копию, либо прежние данные с ошибкой;
store возвращает результат синхронно, hook подписывает React на этот store.
При отказе очередь не продвигается. Проверки дерева, ролей, критериев и режима
одинаковы для полной формы, inline-правок и групповых действий. Это поведение
проверяется `task-manager-prototype.int.spec.ts` и
`task-manager-commands.int.spec.ts`; оно не заменяет серверные EX-проверки выше.

### 11.1. Контейнеры в frontend reference 0.7

В интерфейсе Workspace называется «Рабочая среда». Внутренние идентификаторы
workspace/workspaceId сохраняются. Локальный state содержит workspaces, projects,
folders, lists и tasks.
Project относится непосредственно к Workspace через workspaceId. Space отсутствует. Folder хранит projectId и parentId; List — projectId и folderId.
Task хранит projectId, обязательный listId и необязательный parentId задачи.
Чеклисты остаются частью Task, подзадача — полноценной Task с собственным ID.

Создание Workspace/Project/Folder/List проверяет родителя и уникальность
названия среди однотипных соседей. Workspace создаётся пустым. Project атомарно создаёт основной List «Задачи».
Folder может содержать вложенные Folder и List; контейнер не содержит Task напрямую.
Команда возвращает созданную location, чтобы UI сразу перешёл к ней.
Выбор Workspace/Project/Folder/List использует общий selector принадлежности;
счётчики и представления читают один state, без копий задач.

Полная форма проверяет согласованность List/Project/parent Task. Ребёнок наследует
List родителя; изменение List у родителя с потомками отклоняется. Циклы и сироты
недопустимы, отказ не публикует частично созданные записи. Guards исполнения,
архива, зависимостей, делегирования и принятия сохраняются.
Иерархия является демонстрацией в памяти и не обеспечивает серверную изоляцию
Workspace или серверные права доступа. Локальное управление средами описано
в §11.2. Редактирование/перенос/удаление проектов, папок и списков, вложенные
пункты чеклистов и task-in-multiple-lists требуют следующих срезов.

### 11.2. Локальные команды рабочей среды

Workspace расширен ownerId/members/visibility/timezone/workingDays/color/icon,
archived/revision/createdAt/updatedAt. currentActorId принадлежит demo-state,
не выдаётся за серверную идентификацию. Workspace create/save/member/archive
используют тот же reducer/store. Отказ не публикует частичных изменений.
Save/member/archive проверяют expectedRevision; owner не удаляется через member
операции. Guards запрещают запись в недоступную/архивную среду и учитывают
принадлежность проекта, списка и task. Архив не меняет состояния задач и запусков.
Metadata-команды среды не вызывают advanceQueue, включая восстановление.

## 12. Первая постоянная поставка Foundation

Это ограниченный срез существующих требований, не полная поставка Task Manager.
Owner — `packages/payload-task-manager`, пакет `@realize/payload-task-manager`;
host подключает Payload plugin и задаёт admission/каталог участников.
Публичные DTO/validators — export `./contracts`; server composition — `./server`.
Пакет не импортирует host `@/`, `payload-types` или внутренности AI runtime.
Текущий atomic adapter требует Payload 3.88.0/PostgreSQL; иные DB и независимая
установка npm-архива должны пройти отдельную проверку переносимости.

### 12.1. Данные, права и транзакции

Пять закрытых collections: `realize-task-projects`, `realize-task-lists`,
`realize-tasks`, `realize-task-events`, `realize-task-operations`.
Обычные collection REST/GraphQL CRUD запрещены: операции идут через фасад,
который проверяет admission, project membership и инварианты, затем использует
Local API в общей транзакции. Host Realize допускает только администраторов.
Owner автоматически включён в members; разрешённые члены имеют read/write
для задач и списков. Изменение проекта и его состава принадлежит только owner
(новый source-контракт §12.5). Участники каталогизируются с сохранением host user-read ACL;
публичный DTO содержит ID/name без email или credentials.

Project create атомарно создаёт List «Задачи». У Project/List/Task постоянные
UUID IDs; task key `TASK-<numeric storage ID>` выдаётся сервером. Команда создания
задачи принимает `projectId` и `listId`. При обновлении Task Manager сохраняет оба значения.
Task содержит title/description
plain text, status `backlog/in_progress/review`, priority, assignee либо null,
revision, Git bindings, авторов и даты. Исполнитель — разрешённый project member.
Done/Closed, приёмка, архив, перенос и AI-запуск входят в следующие поставки.

Update требует `expectedRevision`; PostgreSQL transaction/advisory locks
сериализуют competing writers. Audit event и task mutation фиксируются вместе.
Автор определяется только серверной сессией. Immutable receipts сохраняют
результат create/update по actor/operation/Idempotency-Key/request hash;
повтор с другим payload — conflict, повтор прежнего запроса возвращает прежний
результат после новой проверки доступа. Audit/receipts нельзя перезаписать.
Если у запроса на изменение уже задан `transactionID`, Task Manager возвращает
`503` до чтения или записи данных задачи.
В установленном Payload collection Local API при ошибке завершает общую
транзакцию; поэтому обещание вложенной атомарной task unit через savepoint
было бы неверным. Собственная транзакция сохраняет атомарность task/event/receipt,
а отклонённый внешний request оставляет транзакцию caller без изменений.
Миграции проверяются на пустой и обновляемой изолированной БД; schema push
пользовательской установки не применяется. Down не уничтожает накопленное досье.

### 12.2. API и интерфейс

| Endpoint после host `/api`                | Результат                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- |
| GET/POST `/task-manager/projects`         | Доступные проекты / создание проекта и default List                 |
| GET/PATCH `/task-manager/projects/:id`    | Актуальный проект / изменение metadata и members владельцем (§12.5) |
| GET `/task-manager/lists?projectId=…`     | Доступные списки проекта                                            |
| POST `/task-manager/lists`                | Создание списка участником проекта (§12.5)                          |
| GET/PATCH `/task-manager/lists/:id`       | Актуальный список / переименование участником проекта (§12.5)       |
| GET `/task-manager/participants`          | Ограниченный каталог допустимых участников                          |
| GET/POST `/task-manager/tasks`            | Страница задач выбранных projectId/listId / создание                |
| POST `/task-manager/tasks/from-workspace` | Первичное создание/повтор по `clientTaskId` (§12.4)                 |
| GET/PATCH `/task-manager/tasks/:id`       | Точная Task revision / изменение с expectedRevision                 |
| GET `/task-manager/tasks/:id/events`      | Страница истории доступной задачи                                   |

Обычные create/update требуют UUID `Idempotency-Key`; intake из §12.4
использует собственный `clientTaskId`. Envelope: `{ok:true,data}` либо
`{ok:false,error:{code,message,fieldErrors?}}`. Страницы имеют `{items,nextCursor}`;
`after` задаёт курсор следующей страницы. Cursor связан с actor и scope запроса,
не раскрывает storage IDs и не расширяет доступ. Ошибки authentication, ACL,
validation и revision конфликтов различимы; raw Payload documents не выдаются.

Рабочий host route `/system/task-manager` использует общую системную оболочку,
реальные Project/List и API-adapter. Данные формы сохраняются при conflict;
загрузка актуальной revision выполняется явно. Устаревший response не подменяет
новый выбор. Переключение light/dark сохраняется через host theme cookie и
переживает reload; таблица на узком экране прокручивается внутри контейнера,
сохраняя читаемую ширину названия. Публичный `/reference/task-manager` и защищённый reference остаются
демонстрацией; неподключённые команды не изображают реальное исполнение.

Git binding содержит `repositoryId`, полный `commitSha` (40/64 hex),
`purpose: platform-core|customer-project`, `source: manual`,
`verification: unverified`. Он не вызывает Git-команды и не подтверждает
существование коммита. Отдельный Git observation adapter из §13 получает факты
от существующего source-control owner; новый provider client внутри task domain
не создаётся. Releases и установленная версия читаются через их владельцев.

### 12.3. Приёмка Foundation

- Project/Task create и update переживают reload/restart; default List и audit
  создаются атомарно, повтор команды не создаёт повторные сущности/события.
- Другой project member имеет разрешённый доступ; посторонний/неадминистратор
  не получает task, историю, списки или counts через API и прямой collection CRUD.
- Два edits одной revision дают один успех и один conflict; проигравшая форма
  сохраняет ввод. Unknown outcome повторяется с тем же ключом.
- Actor, revision, созданные Git bindings и история совпадают с сервером;
  клиент не может присвоить авторство, verification или статус приёмки.
- Пагинация не теряет записи и курсор не переносится на другой actor/scope.
- Миграции, типы, browser формы/focus/mobile и заданные contract tests проверены;
  существенные непроверенные границы явно указаны.

Срез не разрешает удаление локальных задач: intake §12.4 не заменяет import
файлов, artifact storage, полный agent access и cutover из продуктового §15.

Проверка PostgreSQL запускается через `npm run check:tasks:postgres`, браузер —
через `TASK_BROWSER_TASK=.ai-workspace/tasks/<localKey> npm run check:tasks:browser`.
Для браузера требуется существующее несвязанное managed досье локального резерва
либо явно принятое legacy через `adopt` (§8.1). Успешный серверный `create`
такого каталога не создаёт; серверная задача не является fixture workspace.
Обе проверки создают собственную временную БД на loopback PostgreSQL, отключают
schema push и фоновые AI workers; рабочая БД установки не мигрируется.
Browser fixture использует отдельный Next process/dist и producer lifecycle
из §8.2: logs/screenshots остаются в выбранном досье, собственный tmp очищается
после подтверждённой остановки ресурсов и восстановления Next inputs.

### 12.4. Первичный intake из рабочего слоя (2026-10-19)

`POST /api/task-manager/tasks/from-workspace` принимает строгий
`TaskWorkspaceCreateInput`: поля `TaskCreateInput` и UUID `clientTaskId`.
Владельцы — [публичный контракт](../../packages/payload-task-manager/src/contracts/TaskWorkspace.types.ts)
и [intake service](../../packages/payload-task-manager/src/server/TaskWorkspaceIntake.service.ts).
Обязательны существующие поля создания, включая `status`, `priority`,
`assigneeId` и `gitBindings`; произвольный local metadata не принимается.
Actor определяется Payload user session/JWT либо endpoint-local scoped bearer
центра доступов, затем проверяются host admission, project membership и принадлежность
List. Intake требует `task-manager:write`; scoped bearer не открывает generic Payload CRUD.

Task хранит nullable глобально уникальный `workspaceSourceId` и неизменяемый
hash нормализованного исходного create без actor и `clientTaskId`. Это
долговечная identity источника, не TTL idempotency receipt. Совпадающие UUID и
исходный hash возвращают текущий TaskDTO, включая новые разрешённые изменения
задачи, с `disposition: existing`; первое создание возвращает `created`.
Другой payload, project или list под тем же UUID дают conflict. Проверка доступа
предшествует source lookup; чужая задача не раскрывается через deduplication.
Заголовок `Idempotency-Key` этому endpoint не требуется.

Создание task, начальное audit event и source binding атомарны; конкурирующие
повторы не создают второй Task. Общий Task update не меняет source identity
и initial hash. Обычное создание через UI остаётся без workspace source.
Endpoint не пишет локальную файловую систему, не импортирует TASK/manifest
и не изменяет категории серверного Foundation. Передача на сервер не является
приёмкой, архивом либо разрешением на очистку локальных материалов.
Schema принадлежит source migration `20261019_065606_task_workspace_intake`;
guards и ограничения rollback описаны в
[runbook миграций](../delivery/03-migrations-and-rollback.md#1-канонический-порядок-миграций).

Локальная активация проверена 19 октября 2026 года после применения M33 и
переключения web на build `ETNHSUtT24y6haUFL630m`. Запрос с ключом
`2026-10-19-task-manager-live-check-44a1` после первоначального HTTP 404
повторён с прежним `clientTaskId` `138f5f61-a72a-4036-9527-eff4e18b1584`.
Создана одна `TASK-2` (`7eb06de9-8cc1-4962-b3c9-aaca73dca161`), revision 1,
в проекте «Рабочий стол» и списке «Задачи». Повтор CLI вернул ту же привязку;
браузер показал задачу, отдельная read-only проверка БД нашла ровно одну запись
для source UUID. Общее число задач и событий изменилось с 1/1 на 2/2;
локальные TASK/manifest не созданы.

Для этой проверки user JWT передавался только в окружение дочернего CLI процесса.
Постоянные credentials будущих shell/IDE запусков той проверкой не настроены.
Следующий новый create при полностью незаданном подключении
по-прежнему создаёт допустимый локальный резерв `not_configured`.

### 12.5. Явный выбор Project/List и управление через CLI (2026-10-19)

Этот срез активирован 19 октября 2026 года в локальной web-сборке
`Dfi6Wz9am3HM5TVk5N8El` вместе с центром доступов. Само управление проектами
не требует новой миграции. Подключение CLI
содержит URL и credentials; выбор `--project`/`--list` закрепляется за конкретной
задачей по §8.3. Отдельный [центр доступов](../architecture/platform-access.md)
добавляет M34, browser login и системное хранение credentials.

CLI предоставляет `projects`, `project`, `project-create`, `project-update`,
`lists`, `list`, `list-create` и `list-update`. Это серверные команды без
локального fallback, TASK или artifact manifest. Точные аргументы, JSON
и примеры принадлежат [CLI owner](../../.ai/tools/task-workspace/README.md#проекты-и-списки).
Чтение возвращает текущий DTO или страницу `{items,nextCursor}`.

Строгие входы принадлежат
[schemas](../../packages/payload-task-manager/src/contracts/taskManager.schemas.ts)
и [типам](../../packages/payload-task-manager/src/contracts/TaskManager.types.ts):
Project update принимает полные `title`, `description`, `memberIds` и
`expectedRevision`; List create — `projectId`, `title`; List update —
`title`, `expectedRevision`. Частичная delta в этих входах не поддерживается.

Project update разрешён только owner. Владелец неизменяем и всегда сохраняется
в members; допускается до 100 остальных участников. Состав заменяется целиком.
Удаление участника не переписывает существующие task refs и `assigneeId`.
Любой текущий участник может создавать и переименовывать списки своего проекта;
projectId списка неизменяем. Delete/archive и передача ownership не предоставлены.

POST/PATCH требуют UUID `Idempotency-Key`; CLI передаёт обязательный
`--request-id`. При неизвестном исходе повторяют тот же request-id и payload.
Updates проверяют `expectedRevision` из JSON; конкурентная устаревшая запись
отклоняется. No-op с теми же metadata и набором members не повышает revision.
Replay возвращает сохранённый receipt snapshot после новой проверки прав;
для текущего состояния нужен GET. Это отличается от intake §12.4,
возвращающего текущую задачу по immutable source identity.

## 13. Ограниченное чтение Git-фактов (2026-10-12)

Первый срез расширил Foundation живой read-only проекцией для ручных привязок
задачи. Текущий live DTO дополнен CI точного SHA; долговечная фиксация того же
наблюдения находится в §14. Эти ограниченные API не завершают поставку Git
observation из продуктового §15.2: provider events и автономная сверка после
сбоя остаются последующими шагами. Сохранённые `TaskGitBinding` продолжают иметь
`source: manual`, `verification: unverified`; чтение не изменяет задачу,
ревизию, audit или receipt.

### 13.1. Владельцы и доступ

`packages/payload-task-manager` владеет публичным DTO и task API, проверкой
admission/project membership и соответствием результата текущей ревизии.
Host передаёт модулю read-only port. Существующий integration runtime owner
`@realize/payload-ai-control/server/integration-runtime` владеет подключением,
credential vault и обращением к GitHub API. Task package не получает токен,
не импортирует host и не создаёт самостоятельный provider client.

Адаптер Realize передаёт в `GitHubObservationService` только привязки с
`purpose: platform-core`. Перед обращением к GitHub сервис сверяет `repositoryId`
со slug репозитория в настроенном подключении и проверяет формат `commitSha` —
ровно 40 символов `[a-f0-9]`. Foundation продолжает принимать 40/64 hex как ручной идентификатор;
64 hex не объявляется поддержанным текущим GitHub adapter. Привязки
`customer-project` и иной repository ID не разрешают чтение через credentials
репозитория платформы: registry клиентских репозиториев и отдельные полномочия
ещё не подключены.

Task admission и membership проверяются до provider reads и повторно после
них. Host admission перечитывает текущую запись того же пользователя через
обычный Payload user access в независимом Local API request, без наследования
caller transaction или request cache; `req.user` не подменяется. Старое
`req.user.roles` не сохраняет отозванную роль. Удалённый actor или потерянное
членство не получает ранее прочитанные
факты. Provider owner также повторно сверяет состояние, репозиторий и ревизию
подключения перед выдачей результата. Если за время
чтения изменились ревизия или привязки задачи, API возвращает `409`. Интерфейс
предлагает закрыть и снова открыть карточку, чтобы загрузить актуальную задачу
перед новым запросом. Совпадение task key или ветки
не заменяет эти проверки.

Git observation facade требует request без внешней `transactionID`: чужой
transaction snapshot не гарантирует актуальные ACL и revision после сети.
Унаследованная транзакция даёт `503` до task/provider reads и остаётся во
владении caller; task domain не завершает и не откатывает её. Отсутствие
внешней транзакции проверяется также перед итоговым перечитыванием доступа.

### 13.2. API и интерфейс

`GET /api/task-manager/tasks/:id/git-observations` возвращает строгий публичный
DTO в существующем envelope `{ok:true,data}`: `taskId`, `taskRevision`,
`observedAt`, `complete`, `items`. Ответ относится к task ID и конкретной
ревизии, содержит время наблюдения и результат чтения каждой
обработанной сохранённой привязки. Foundation допускает до 50 ручных привязок;
один запрос обрабатывает первые восемь, одновременно не более двух. Поле
`complete` отражает покрытие привязок задачи; при превышении лимита оно равно
`false`, а интерфейс показывает фактическое количество обработанных привязок.
Credentials и сырые provider/Payload documents не выдаются. Ответ не кэшируется.

Каждый `items` элемент содержит исходную `binding` и `status: observed` со строгими
`repository`, `commit`, `pullRequests`, `pullRequestsComplete`, `ci` либо `unavailable`
с reason `not_configured`, `repository_not_allowed`, `unsupported_sha`,
`provider_unavailable` или `invalid_response`. `repository` содержит GitHub
numeric ID как строку, `fullName` настроенного slug и безопасный canonical URL;
привязка сопоставляется с `fullName`, а не с numeric ID. `commit` содержит точный
SHA и безопасный URL; PR — `number`, URL, `state`, `draft`, `merged`. Ответ
GitHub `404` означает недоступность чтения и не доказывает отсутствие repository
или коммита. Ошибки и отсутствие настроенного подключения не повышают статус
сохранённой привязки.

GitHub сообщает сведения о репозитории, точном коммите и PR, связанных с этим
коммитом через API associated pull requests. Проекция показывает только
возвращённые этим запросом факты: первая страница до 20 PR. Следующая страница
в provider `Link` делает `pullRequestsComplete: false`; это поле независимо от
покрытия task bindings в `complete`. Даже `pullRequestsComplete: true` относится
только к ответу API associated pull requests и не обещает полный перечень всех
PR репозитория или восстановление связей после squash/rebase. Весь цикл чтения
одной привязки ограничен десятью секундами, каждый provider body — 1 MB
(1 000 000 bytes).
Статус PR не означает приёмку задачи, прохождение CI, release либо deployment.

`ci` содержит два независимых канала: `checkRuns` и `commitStatuses`.
Каждый канал имеет `status: observed` с `items`, `totalCount`, `complete` либо
`status: unavailable` с reason `provider_unavailable` или `invalid_response`.
Недоступный CI-канал не выдаётся за пустую успешную проверку и не подменяет
другой канал. Общая недоступность подключения или исчерпанный deadline по-прежнему
может сделать всю привязку `unavailable`.

Check Run содержит numeric ID как строку, `name`, точный `headSha`,
`status: queued|in_progress|completed|waiting|requested|pending`, nullable
`conclusion` и безопасный canonical GitHub URL. Заключения:
`action_required`, `cancelled`, `failure`, `neutral`, `success`, `skipped`,
`stale`, `timed_out`, `startup_failure`. Commit status содержит numeric ID
как строку, `context`, `state: error|failure|pending|success`; канал также
содержит `combinedState: failure|pending|success`, сообщённый GitHub.
Descriptions, annotations, credentials и внешние `target_url`/`details_url`
не входят в публичный DTO.

CI запрашивается только для сохранённого полного SHA. Каждый Check Run
сопоставляется по `head_sha`; combined status — по SHA и repository identity
ответа. CI нового PR head, merge commit или результата squash/rebase не
переносится на прежний SHA. `combinedState: success` не является доказательством
наличия или прохождения обязательных checks конкретного workflow.

Оба CI-канала показывают первую страницу до 20 записей. `complete` означает
`totalCount === items.length` при отсутствии provider `Link next` в выбранной
API-проекции; upstream Check Runs ограничен окном API и не обещает всю историю
репозитория. Reference endpoint ограничивает окно последними 1000 check suites;
подробности — [GitHub Check Runs](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference).
GitHub `combinedState` относится только к последним legacy status contexts —
[GitHub Commit Statuses](https://docs.github.com/en/rest/commits/statuses#get-the-combined-status-for-a-specific-reference).
Покрытие CI, PR и task bindings различается. Provider owner
использует общий deadline 10 секунд для чтения одной привязки, включая оба
CI-канала, потоки ответов и повторную проверку подключения.

Рабочая карточка запрашивает факты по явному обновлению. UI связывает ответ с
текущей задачей и ревизией; запоздавший ответ не подменяет другую карточку или
новые привязки. Время чтения и граница текущей проекции видны пользователю.
Ручная привязка остаётся непроверенной в сохранённом досье даже при успешном
живом наблюдении.

### 13.3. Приёмка и остающиеся шаги

- Неавторизованный, неадминистратор и посторонний project actor не вызывают
  provider и не получают факты; отзыв доступа во время чтения закрывает ответ.
- Разрешённая ручная привязка сопоставляется с настроенным репозиторием и
  точным SHA; provider не может подменить repository, commit или безопасный URL.
- Изменение task revision во время запроса возвращает conflict; интерфейс
  не показывает факты для другой ревизии и требует актуализировать
  задачу перед явным повторным чтением.
- Ошибки provider не выдают credentials или сырой ответ; лимит PR не выглядит
  как доказательство полноты. Клиент отвергает ответ с лишними/raw полями.
- Чтение не создаёт task events, не меняет `verification`, статус задачи,
  схему или generated types и не выполняет Git commit/push.

Долговечные observations/receipts и повтор polling-команды описаны в §14.
Доставка provider events, автономная reconciliation после сбоя и связи с
release manifest остаются следующими поставками у тех же владельцев.
Done/приёмка, клиентские repositories и cutover локальных задач остаются открытыми.

## 14. Долговечная синхронизация Git по запросу (2026-10-12)

Это законченный ограниченный polling-срез: пользователь явно получает и
сохраняет Git/PR/CI-наблюдение, а после потери ответа восстанавливает результат
по тому же Idempotency-Key. Webhook ingestion, автономный background worker
и периодический reconciler не входят в срез. GET из §13 сохраняет read-only
семантику; запись выполняет отдельный POST.

### 14.1. Команда, история и владельцы

| Endpoint после host `/api`                      | Результат                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| POST `/task-manager/tasks/:id/git-syncs`        | Долговечный результат polling сохранённых привязок указанной ревизии |
| GET `/task-manager/tasks/:id/git-syncs?after=…` | Страница сохранённых результатов доступной задачи, новые первыми     |

POST принимает строгий `TaskGitSyncInput: {expectedRevision}` и UUID
`Idempotency-Key`. Клиент не передаёт provider-факты, actor, привязки,
receipt ID или статус проверки. Публичный `TaskGitSyncDto` включает весь
`TaskGitObservationsDto` из §13 и поля `id`, `projectId`, `actorId`, `recordedAt`.
`observedAt` относится к окончанию получения наблюдения, `recordedAt` —
серверное время его записи. Это разные моменты, а не provider event timestamp.

История использует существующий envelope/page DTO и opaque actor/query-bound
`after` cursor; размер страницы — 50. Изменение текущей задачи не переписывает
сохранённый результат прежней ревизии. Доступ к истории определяется текущими
admission и membership, а не правами actor в момент записи.

Task domain владеет immutable sync record и operation receipt. Provider owner
по-прежнему владеет чтением GitHub и credentials; host передаёт тот же typed
read-only port. Отдельная история синхронизации не меняет task audit events,
статус, приёмку, task revision или `manual/unverified` в сохранённых привязках.

Скрытая collection `realize-task-git-syncs` хранит отдельный snapshot с task,
project, actor и task revision; прямой REST/GraphQL CRUD закрыт. Payload hooks
и PostgreSQL trigger запрещают update/delete. Operation receipts переиспользуют
существующую `realize-task-operations`. Source миграции —
[`scripts/migrations/task-git-sync.mjs`](../../scripts/migrations/task-git-sync.mjs);
официальный generator создаёт добавочную `20261011_215235_task_git_sync` из
Foundation predecessor. Generated types/snapshot не правятся вручную.

### 14.2. Атомарность, повторы и конфликты

Перед polling проверяются независимый request, текущий actor/admission,
project membership и ожидаемая task revision. Provider reads выполняются вне
DB-транзакции и advisory locks. Перед фиксацией task domain повторно проверяет
доступ, ревизию и принадлежность привязок; изменённый результат не записывается
как факт новой ревизии. Унаследованная transactionID отклоняется без завершения
caller transaction.

Immutable sync record и actor/operation/command-bound receipt фиксируются
атомарно. Ошибка записи оставляет оба отсутствующими. Повтор принятой команды
с тем же ключом и payload после свежей проверки доступа возвращает первоначальный
receipt без нового provider read или второй записи. Он остаётся историческим
результатом исходной task revision, даже если текущая задача уже изменена.
Повтор ключа с другим payload даёт `409`. Новое наблюдение требует нового ключа.

Конкурирующие доставки одного ключа сохраняют один результат; read-only
provider запросы до принятия receipt могут повториться. Контракт не обещает
однократного HTTP polling. Потеря ответа или browser timeout не доказывают
откат: открытая карточка сохраняет исходные payload/key и сначала повторяет
ту же команду, включая изменение текущей task revision.
Отозванный доступ закрывает replay и историю. Сбой до durable commit позволяет
повторить ещё не принятую команду; процесс не возобновляет её автоматически.

Provider errors сохраняются как явно недоступные результаты конкретной попытки.
Следующая неудачная попытка не уничтожает более раннее успешное наблюдение и
не изображает его свежим. Сохранённые SHA, PR и CI относятся к точной привязке
и ревизии receipt; другая ревизия требует отдельного polling и не наследует
старый CI success.

### 14.3. Интерфейс и приёмка

Карточка явно разделяет live проверку и долговечную синхронизацию. История
переживает reload, закрытие карточки и restart Payload; показывает actor,
время и ревизию результата. Сведения прежней ревизии обозначаются как
исторические. Неизвестный исход записи удерживает исходную команду и ключ для
повтора, пока карточка остаётся смонтированной. Ключ неподтверждённой команды
не сохраняется в browser storage: после закрытия карточки или reload GET
восстанавливает записанную историю, без автоматического нового POST.
Server receipt остаётся доступным по исходному ключу для клиента, который
сохранил эту команду; восстановление истории не объявляется восстановлением
утраченного browser key. UI не объявляет неподдержанные, пустые или неполные CI данные
прохождением обязательных проверок и не закрывает задачу.

- POST/GET/replay сохраняют admission/membership и строгий DTO boundary;
  внешняя транзакция не получает network polling или task domain writes.
- Потерянный ответ, повтор после restart и конкурирующие одинаковые команды
  дают один durable receipt; изменённый payload того же ключа — conflict.
- Task revision, actor или доступ, изменившиеся за время network, не создают
  запись для неверной задачи/ревизии; network не удерживает DB locks.
- Fault injection при записи подтверждает полный rollback; sync/receipt нельзя
  изменить или удалить через generic CRUD и прямую обычную DB mutation.
- CI точного SHA сохраняет состояния `pending`, `failure`, `success`,
  unavailable и неполное покрытие без подмены приёмкой или PR head checks.
- PostgreSQL migration проходит fresh/full chain, restart durability и empty
  down/up; populated down блокирует потерю записанных результатов.
- Browser подтверждает сохранение истории после close/reopen/reload,
  историческую ревизию, сохранность неудачных попыток и повтор unknown outcome
  с прежним ключом; внешний page layout, keyboard/focus и темы сохраняются.

Полная Git observation поставка §15.2 продуктового ТЗ остаётся открытой: server-owned event
ingestion, автономная сверка, расширенное покрытие истории/клиентских repository,
release traceability и смена рабочего слоя здесь не реализуются.

## 15. Целевой контракт задач ENG-04

**Target specification, 24 октября 2026.** TASK-62 уточняет предметный слой
для ENG-16–20. Producer — `packages/payload-task-manager`; consumers — его
Admin, task-workspace CLI и будущие MCP/engineering adapters. Общие границы —
[ADR-0019](../architecture/decisions/ADR-0019-shared-engineering-operations.md),
файлы/материалы — [контракт артефактов](../architecture/engineering-artifacts.md).
Ниже выбраны базовые правила первой поставки; расширенный scheduler, отдельная
роль reviewer, quorum, custom fields и весь frontend reference этим не реализуются.

### 15.1. Независимые состояния и базовые статусы

| Измерение             | Контракт                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`              | `{id, category}`: категория `open`, `active`, `done`, `closed`; status ID стабилен, подпись изменяема. Начальные IDs: `backlog → open`, `in_progress → active`, `review → active`, `done → done`, `closed → closed`. |
| `readiness`           | Вычисляемые blockers, включая зависимости, assignment, authority и recovery. Не пользовательская запись «разрешить запуск».                                                                                          |
| `execution`           | Ссылки на реальные owner/run/stage/attempt и их наблюдаемое состояние (§5). Без запуска — `null`, не синтетический succeeded.                                                                                        |
| `acceptance`          | `required`, policy reference и `state: not_requested                                                                                                                                                                 | pending   | accepted  | rejected                                                                                                                            | stale   | not_required`; ссылка на неизменное решение и проверяемую версию результата. |
| `delivery`            | Версионированные требования и observations по целям commit/push/merge/release/deploy. Сводка `not_required                                                                                                           | pending   | satisfied | failed                                                                                                                              | unknown | stale` вычисляется; успешный commit не подтверждает deploy.                  |
| `outcome`, `closedAt` | Outcome `null                                                                                                                                                                                                        | succeeded | cancelled | exception`. Успех только после closure gates; cancelled/exception сохраняют причину и не выполняют зависимость на успешную приёмку. |
| `archivedAt`          | Отдельная видимость/доступность для новой работы; архив не задаёт outcome и не удаляет историю.                                                                                                                      |

`review` означает запрос разбора/работу над замечаниями, включая исторические
карточки без typed result. В `done` переводит сдача полного долговечного
результата; тестирование/приёмка ещё могут ожидаться. В `closed` переводит
завершение согласованного процесса. Первая поставка использует эти фиксированные
IDs; последующие custom statuses обязаны сохранять категории и выбранный
active-return status. Старое `review` не становится `done` или `accepted` при миграции.

### 15.2. Ревизии, результаты и evidence

Отдельные версии отчёта, карты покрытия и заключения связаны с попытками аудитора и ревьюера. Решение ссылается на точное заключение и редакцию основания. [Контракт публикации и приёмки](task-management/execution/review-conclusion.md)

Task `revision` — CAS всей редактируемой карточки. Отдельно фиксируются версии
критериев, acceptance policy и delivery requirements: перестановка в списке
или исправление заголовка не делает пригодный результат устаревшим автоматически.
Изменение цели/scope, критериев, обязательных checklist/children/dependencies,
требований checks или замена результата меняет соответствующий fingerprint.
Операция не может объявить смысловую правку косметической клиентским флагом.

`TaskResult` — неизменяемый ID/revision, task/assignment/attempt refs при наличии,
база требований, summary, выполненные критерии, ограничения и ссылки на:

- Artifact ID/version/hash, назначение и владельца хранения. Путь в checkout
  без сохранённой версии — наблюдение, а не гарантированно доступный результат.
- Check receipt с recipe/input/runtime identity, coverage, исходом и freshness.
  Общий verification owner проверяет пригодность; строка «тесты прошли» её не заменяет.
- Engineering receipt либо явно обозначенное native observation; Git observation
  или manual/unverified binding. Каждый источник сохраняет своё происхождение.

Результат без файлов допустим: например решение или диагностика, сохранённые
в server-owned result record. Для файла descriptor kind/hash не доказывает
выполнение или приёмку. Raw logs/prompts, секреты и произвольные локальные пути
не выдаются через DTO; ссылки открываются через ACL соответствующего владельца.
Неуспешная публикация обязательных материалов оставляет submission pending.
Task DB transaction не удерживается во время загрузки, проверки или процесса.

`AcceptanceDecision` связывает task и `taskRevisionAtDecision`, result, criteria/check-policy fingerprints,
обязательные child results/dependency pins, actor/delegation, verdict, причину
и время. Результат или verdict не переписывается; новая запись явно заменяет
текущее решение, сохраняя прежнее. Required checks должны быть passed и пригодны;
unknown/missing/stale не равны passed. Семантический критерий имеет явный verdict
ответственного лица; число файлов или зелёный CI его не подменяют.

Решение о принятии по умолчанию принадлежит владельцу проекта или назначенному
им принимающему. Это ответственность, а не обязательная новая роль, отдельный
LLM или подтверждение каждого файла. `required: false` допускается только явной
versioned policy с сохранением остальных closure gates. Self-acceptance запрещена,
если policy требует независимости; автоматическое решение допустимо лишь в
заранее разрешённой policy и не выдумывает отсутствующие evidence. `not_required`
не равно `accepted`: зависимость с предикатом приёмки ждёт реального решения;
явное принятие допустимо и при необязательной приёмке. Audit revision решения
сохраняется, а его актуальность определяется значимыми fingerprints, не сменой
заголовка или сортировки.

### 15.3. Переходы и условия завершения

Все переходы — предметные команды с CAS, idempotency и audit, одинаковые для
формы, drag-and-drop, CLI, MCP и bulk. Обычный metadata update не записывает
acceptance/delivery/execution напрямую. `E` в таблице означает разрешённого
редактора задачи, `A` — назначенного принимающего, `O` — владельца проекта
или его явно делегированную полномочную policy (§15.4).

| Команда / переход                               | Кто                | Обязательные условия и эффект                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create → `backlog/open`                         | E                  | Доступный активный Project/List, допустимый assignee, исходные criteria/policy; нет фиктивных execution/result/acceptance.                                                                                      |
| Start/resume → `in_progress/active`             | E                  | Задача не архивна/closed; актуальная readiness и admission для запуска. Изменение статуса само не запускает агента.                                                                                             |
| Request review → `review/active`                | E                  | Явный предмет разбора/ссылка на кандидат результата. Не означает полноты, прохождения checks или принятия.                                                                                                      |
| Submit complete work → `done/done`              | E                  | Durable result, выполненные обязательные задания и доступные требуемые материалы; отсутствие известных failed required checks. Pending checks/приёмка явно видны. Подпись статуса не обходится без submission.  |
| Record acceptance/rejection                     | A                  | Решение по текущим versions и criteria. Accepted требует пригодных обязательных checks/verdicts; rejected возвращает в `in_progress/active`, причина сохраняется.                                               |
| Close successful: `done → closed`               | E                  | Текущая acceptance accepted либо явно not_required; все обязательные criteria/checklists/child results/checks/dependencies и delivery выполнены, нет активных writers/attempts или recovery. Outcome succeeded. |
| Accept and close                                | A + E              | Одна явная атомарная команда с теми же gates; два отдельных клика не обязательны.                                                                                                                               |
| Required check failed / material result changed | Domain service / E | Текущая приёмка stale или rejected; категория active, outcome/closedAt сброшены, прежняя история сохранена. Для редактирования принятого результата сначала reopen либо атомарный reopen-and-change с причиной. |
| Return `active → open`                          | E                  | Явная причина перепланирования, нет активного исполнения/unknown side effect. Snapshot attempt не меняется; очередь сама не перезапускается.                                                                    |
| Close cancelled / exception                     | O                  | Причина, явный verdict и подтверждённая остановка активной работы; exception не маскирует known failed как accepted. Закрытие не разрешает Git/deploy/удаление.                                                 |
| Reopen `closed → active`                        | E                  | Причина, новая revision, прежний outcome/decision исторические; current acceptance stale/not_requested. Никакого автоматического retry старого attempt.                                                         |
| Archive / restore                               | O                  | Отдельные правила §15.6; статус, результат и отсутствие приёмки не подменяются успехом.                                                                                                                         |

Для обычного рабочего перехода сохраняется свобода остановиться и исправить
результат. Из `done` в active разрешён возврат с причиной. Closed-задача не
получает новый result, criteria или scope через обычный PATCH. Изменение текущих
предпосылок закрытого родителя/зависимой задачи делает её acceptance stale и
возвращает к пересмотру; обработка принадлежит task domain, не только UI.

Обязательный deploy учитывается только при включении в criteria/delivery policy.
Если приёмка относится к качеству работы до поставки, accepted + delivery pending
допустимы, successful closure — нет. Если сам критерий требует deployment, до
подтверждения нельзя принять и этот критерий. Commit/push/merge — отдельные
разрешённые действия существующего Git-владельца.

### 15.4. Операции проектов, списков и задач; права

Membership/admission/scopes проверяются заново перед side effect и replay.
Текущий host требует admin + membership; `E` сохраняет существующее право
участника редактировать задачи, а не ограничивает его assignee/createdBy.
`A/O` — новые предметные проверки, не новые полномочия существующего bearer.
Целевая матрица scopes/grants определена в
[ENG-05](../architecture/platform-access.md#единые-инженерные-полномочия-eng-05):
новые `task-manager:accept` и `task-manager:govern` не добавляются старым токенам.
UI/роль, ownership ОС и Git-доступ не заменяют предметный ACL. Generic Payload
CRUD остаётся закрытым; действующий v1 admission этим документом не меняется.

| Объект и команды                                               | Права и граница                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project: list/get/create                                       | Read по admission/membership; create по существующему projects permission. Создание атомарно включает default List «Задачи».                     |
| Project: metadata/members/policy/archive/restore               | O; owner остаётся в members. Передача ownership — отдельная операция, не произвольное поле PATCH и не часть первой поставки.                     |
| List: list/get/create/rename/order                             | Read или E своего проекта; принадлежность Project сохраняется. Перенос List между проектами не заменяет план task tree move.                     |
| List: archive/restore                                          | O с проверкой всего выбранного содержимого; восстановление не запускает задачи.                                                                  |
| Task: list/get/events, доступные results                       | Read по current ACL и ACL соответствующей исторической записи/артефакта. Cursor actor/scope-bound, raw documents не выдаются.                    |
| Task: create/metadata/priority/assignee/parent/relations/order | E; assignment только действительному участнику. Структурные изменения дополнительно проверяют обе стороны/граф/CAS; status transitions отдельны. |
| Task: move внутри проекта                                      | E исходного/целевого List, согласованная ветка и её revision snapshot.                                                                           |
| Task: move между проектами                                     | O обеих сторон, explicit mapping и единый план; bulk не понижает требования.                                                                     |
| Result / acceptance / exceptional close                        | E сдаёт результат; A принимает; O назначает policy и разрешает исключение. Требование независимости и делегирование проверяются отдельно.        |

Priority сохраняет `low|normal|high|urgent`. Assignee `null` допустим для backlog.
Удалённый участник/пользователь сохраняется как исторический ID, не получает
доступа и не исчезает из авторства. В v2 не затрагивающий assignment PATCH может
сохранить такой ID с диагностикой; новый запуск блокируется до переназначения.
V1 full update сохраняет прежнюю validation; клиент должен явно исправить assignee.
Назначение не выдаёт права и не создаёт runtime capacity.

### 15.5. Parent, dependencies и порядок

Parent/child — отдельная связь декомпозиции: один parent или null, один Project
и тот же основной List. Начальный предел — 7 уровней от root; установка задаёт
проверяемый limit, изменение лимита не обрезает старые деревья. Цикл/self-parent
запрещены. По умолчанию дочерние результаты обязательны для успешного закрытия
родителя; optional-child требует явного решения с причиной и новой версии условий.
Архив ребёнка не снимает обязательность. Удаление/отключение обязательного ребёнка
не сохраняет прежнюю acceptance родителя автоматически.

`related` симметрична, пара уникальна и может входить в цикл. `depends_on`
ориентирована consumer → predecessor; `blocks` — обратный вид той же записи.
Default predicate — успешная актуальная приёмка конкретного результата.
Cancelled/exception/archived-without-success не выполняют его. Для будущего
результата constraint может быть unresolved; перед запуском planner фиксирует
result/criteria/decision versions. Принятый attempt не следует молча за latest.

Если у predecessor приёмка `not_required` и нет актуального accepted decision,
создание default dependency отклоняется как несовместимое условие: сначала
нужно явно принять результат либо изменить acceptance policy. Добровольная
приёмка неизменного результата разрешена A и после закрытия с not_required,
без переоткрытия и переписывания старого closure. Изменение required → false
при уже существующих acceptance dependencies требует impact plan: сохранить
действующее решение либо согласованно изменить связи/policy; тихое вечное
ожидание не допускается. Иной predicate доступен только после реализации
его проверки, а не как обход поля required.

Parent-tree и dependency graph не допускают циклов. Для default acceptance
dependencies проверяется также совокупный граф ожиданий: обязательный ребёнок
создаёт prerequisite parent → child. Child → parent acceptance создала бы
deadlock и отклоняется, даже если два отдельных графа ацикличны. Stage/artifact
predicates расширяются лишь вместе с доказуемой проверкой такого графа;
пока adapter не поддержан, команда возвращает unsupported.

Межпроектные связи требуют управления связью и доступа с обеих сторон, без
переноса ownership. После отзыва доступа UI возвращает безопасный blocker без
закрытого названия/содержимого. Оценка predicate выполняется сервером в своём
ограниченном scope; ссылка не добавляет данные predecessor в контекст агента.
Изменение dependency активного attempt требует impact plan и подтверждённой
остановки затронутого исполнения; неизменный независимый attempt сохраняется.

Проверка существования/циклов и запись graph mutation атомарны. Для первой
поставки graph mutation сериализуется общей task-domain graph lock установки;
затем project locks берутся в стабильном порядке. Это охватывает конкурентные
межпроектные рёбра и изменения обязательных children, без LLM/Git/FS под DB lock.
Обход ограничен budget: неполная проверка отклоняет mutation, не разрешает её.

Та же graph lock и порядок project locks обязательны для acceptance/closure и
изменений result, criteria, policy, reopen, которые меняют пригодность prerequisites.
Под блокировкой сверяется version vector всех обязательных children/dependencies/
policies, а не только revision собственной задачи. Конкурентная правка до commit
вызывает conflict; правка после принятия атомарно инвалидирует затронутые текущие
decisions/closure и их зависимые summaries, сохраняя историю. Список затронутых
задач вычисляется с budget до записи; неполный обход не оставляет частично
действующую приёмку. Derived invalidation выполняет domain service с causation,
не раскрывая инициатору закрытые задачи. UI cache и уведомления не являются gate.
Внешние checks выполняются до DB transaction; внутри неё проверяются bindings,
версии и freshness receipts. Это не обещает атомарности с изменяемым Git/CI/host:
новое внешнее наблюдение запускает ту же проверяемую инвалидацию.

Порядок задач принадлежит bucket `(projectId, listId, parentId)`; порядок Lists —
Project. `move-before/after` принимает ID соседа/границу bucket и его orderRevision,
а не вычисленный клиентом rank. Rank непрозрачен, назначается сервером; tie-breaker
по стабильному ID, rebalance атомарен и не меняет порядок. Приоритет и порядок —
разные поля; reorder не создаёт dependency и не обещает точную позицию в runtime queue.
Read cursor включает bucket/orderRevision: изменённая сортировка требует reload,
старый cursor не пропускает элементы молча.

### 15.6. Перенос, архив и массовые операции

Move сохраняет Task ID/key, authored history и старые execution snapshots.
Перенос между Lists выполняется для выбранной ветки целиком; отдельного ребёнка
сначала явно detach/reparent в совместимую ветку, все изменения атомарны.
Требуются версии дерева, bucket и исходных/целевых контейнеров. Межпроектный plan
содержит mapping статусов/criteria/участников/policy/bindings и контекста; отсутствие
допустимого assignee разрешается только явным выбором нового или `null`.

Активные attempts, writers, незавершённые handoffs и recovery блокируют apply.
Task facade не останавливает внешнего исполнителя внутри DB transaction:
операция ждёт подтверждённого quiescence и затем заново проверяет guards.
Новые assignments/claims не должны возникнуть между проверкой и commit move:
reservation/fence и повторный claim guard обязательны в ENG-06/17.
Scope/grants/approvals исходного проекта не переносятся как действующие.
Даже сохранённый accepted result требует проверки пригодности целевой policy;
прежнее решение остаётся историческим, текущая приёмка — stale до такой проверки.

Для успешно закрытой задачи move атомарно выбирает один из двух исходов:
сохраняет closed/succeeded при подтверждённой совместимости result, evidence,
принимающего и целевой policy либо возвращает в active со stale acceptance и
сбрасывает current outcome/closedAt. План показывает этот эффект заранее;
состояние closed/succeeded со stale acceptance недопустимо. Новое решение о
приёмке не фабрикуется технической перепроверкой. Closed cancelled/exception
сохраняет свой исторический исход и не превращается в succeeded при переносе.

Archive допускает quiescent задачу независимо от категории и сохраняет её
незавершённость. Архивная задача не получает новый запуск, assignment/result или
обычный update до restore; разрешённые audit/correction команды — отдельны.
Архив родителя требует уже архивных детей либо явной атомарной команды ветки.
Active dependent work блокирует архив predecessor; совместный согласованный
план сначала прекращает затронутую работу. Restore требует активных контейнеров/
родителя либо их совместного восстановления, пересчитывает readiness и не
подтверждает приёмку/запуск. Архив принятого immutable result не уничтожает evidence;
новые ссылки на незавершённые архивные задачи запрещены.

Project/List archive сначала обрабатывает всё выбранное содержимое по тем же
правилам; архив контейнера не меняет outcome дочерних задач. API списка по
умолчанию скрывает архив, явный фильтр читает его с тем же ACL.
Hard delete, каскадное удаление history/results и автоматическая cleanup материалов
не входят в эту поставку.

Bulk использует один ограниченный plan и expected revisions всех затронутых
объектов; результат — all-or-nothing. Ошибки указывают доступные объекты/поля,
не раскрывая скрытые задачи. Большой набор сначала разбивается на явно видимые
самостоятельные планы; это не выдаётся за одну атомарную операцию.

### 15.7. API v2 и совместимость клиентов

Текущий `/api/task-manager/**` остаётся v1 со строгими DTO/командами §12.
Целевой `/api/task-manager/v2/**` использует те же services/transactions, отдельные
contracts/mappers и versioned operation names. У v2 task DTO есть `schemaVersion: 2`,
публичные ID/key/projectId/listId/parentId, revision, status/category, priority,
assignee, order token, criteria/policy refs, result/acceptance/delivery summaries,
outcome/closedAt/archivedAt и разрешённые audit refs. Связи, полные results/events
читаются отдельными bounded страницами, без раздувания каждой карточки.
Nullable значения явны; отсутствующий result/actor не подменяется пустым объектом.

Versioned capabilities сообщают поддержанные команды, форматы и текущие server
limits; discovery не предоставляет права. V2 metadata PATCH задаёт только
изменяемые поля и expectedRevision; lifecycle/result/acceptance/move/relation/
order/archive команды имеют отдельные схемы. Unknown fields отклоняются.
Прежний полный v1 PATCH не превращается незаметно в partial update.

V1 create сохраняет допустимый исходный выбор `backlog/in_progress/review` как
ручного этапа, без выдуманных result/acceptance/execution. V2 create начинается
с backlog; дальнейшие переходы явны. Старые status updates проходят тот же
предметный transition guard, а не прямую запись нового lifecycle в storage.

V1 read сохраняет прежнюю форму без новых полей: backlog/in_progress/review
остаются как есть, done/closed дают консервативное `review`, не обещая приёмку.
Archived скрыты из обычной выборки, detail по ID остаётся ACL-controlled.
Такое чтение не является полноценным v2 интерфейсом. V1 записи допустимы только
для совместимого подмножества задач без новых results/acceptance/relations/
архива и изменений принадлежности; protected task получает `CONFLICT/409` с понятной
ошибкой необходимости обновить клиент, без частичного изменения. Новые поля не
теряются от присланного старым клиентом `status: review`.

Границы первой поставки: custom statuses вне этих IDs требуют v2 и отдельной
поддержки; silent mapping новой семантики на v1 write запрещён. UI/CLI/MCP
переключаются по capabilities; недостаточная версия даёт объяснение/чтение,
а не fallback на raw CRUD, shell/SQL или локальную вторую задачу.

### 15.8. Миграция записей, replay и исторические права

Storage decoder различает прежний и новый formats независимо от transport DTO.
Строгий v2 parser нельзя применить к старым JSON task/receipt до миграции.
Expand-миграция добавляет новые структуры, сохраняет UUID/key/revision/authors/
memberships и immutable events/Git snapshots. `review` остаётся active с
`acceptance: not_requested`, result/outcome/closedAt/archivedAt — null; parent —
null, relations пусты. Начальный order детерминирован по прежнему storage order,
а не случайной сортировке UUID. Default policy не создаёт задним числом verdicts.

Обычный replay сохраняет `(actorId, operation, Idempotency-Key)` и точный
normalized command hash, включая expectedRevision. Replay проверяется до нового
CAS и возвращает прежний результат; тот же ключ с другим payload — conflict.
V1 operation names/normalization не меняются. V2 commands имеют отдельный namespace;
клиент не меняет API version посреди unresolved retry. Ротация credentials того
же actor не создаёт новую операцию, другой actor обычный replay не наследует.
No-op не увеличивает revision/event, но имеет устойчивый mutation receipt.

До включения move обязательны две корректировки совместимости:

1. **Command identity отделяется от текущего projectId.** У старых receipt
   сохраняются оригинальный requestHash/result и исходная scope binding.
   После move повтор ищет receipt по первоначальной identity и проверяет payload
   с исходным scope, не пересчитывает его по новому проекту задачи. Отсутствующий
   доказуемый binding восстанавливается проверяемой миграцией либо блокирует move;
   hash не угадывается и история не переписывается.
2. **Workspace intake хранит creation-command ledger.** `clientTaskId` и hash
   исходной команды связаны с одним Task ID и исходными Project/List. Это не
   проверка неизменности текущего расположения. Retry после move возвращает
   текущую доступную задачу по исходной source identity, сохраняя защиту от другого
   payload и нынешнюю возможность ротации actor для intake. Старые bindings
   переводятся до разрешения move; неизвестный POST повторяется прежним ключом.

Replay всегда заново проверяет текущий доступ к задаче и доступ к возвращаемым
историческим полям. При его потере операция не повторяется под новой identity
и не раскрывает сохранённый result. Для найденного authorized receipt replay
предшествует v1 write guard; guard запрещает новое выполнение, а не повтор уже
состоявшегося эффекта. Workspace intake возвращает current projection своего
API version; mutation replay — прежний immutable result своего формата.

Историческая запись сохраняет project scope момента события. После move
timeline ищет записи по стабильному taskId, но фильтрует по current task ACL
и исходному security scope. Новый member целевого проекта не получает автоматически
старые descriptions, actors/PII, evidence и диалоги. Для недоступной истории —
безопасная сводка/пропуск без закрытых данных, pagination не раскрывает скрытые
storage IDs. Явный перенос разрешённого контекста создаёт новую проверенную
projection со своей provenance; он не переписывает старые events/receipts.

Миграция проходит на пустой и populated изолированной БД, с повторным upgrade,
legacy receipt decoding и retry после move. Down не уничтожает новые данные;
после v2 writes возврат к несовместимому старому binary блокируется. Перед rollout
нужны backup/recovery и совместимый reader; schema push не заменяет миграцию.

### 15.9. Локальный резерв

Task Manager остаётся основным источником. Доступный сервер создаёт задачу без
локального TASK/manifest. Разрешённый fallback §8.3 и
[правило материалов](../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md)
сохраняются: ненастроенная платформа или доказанная недоступность до передачи
POST, но не auth/validation/revision conflict/неизвестный исход запроса.

Локальные open/active/done/closed и result manifests не являются серверной
приёмкой. Intake сохраняет source identity; импорт материалов/results/verdicts
идёт отдельным preview/reconcile с проверкой источника, прав и versions. Без
проверяемой server acceptance локальный closed не мигрирует в successful closed.
После подтверждённой связи server task authoritative, локальные status mutations
блокируются; материалы сохраняются без автоматической очистки. Операционный
журнал engineering-runtime не ведёт собственный task lifecycle.

### 15.10. Сценарии контрактной приёмки

Это требования к будущим проверкам, не выполненные runtime tests ENG-04.

| Сценарий                                                  | Ожидаемый результат                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Старые review задачи и receipts после upgrade             | ID/revision/history сохранены, категория active, без придуманной приёмки; v1 replay читается.                                |
| Файл создан / агент написал «готово» / CI зелёный         | Без полноценного result/criteria/decision нет successful closure.                                                            |
| Проверки подходят неизменным inputs                       | Receipt используется повторно по policy; старый/неполный check не становится passed.                                         |
| Criteria/result изменены после acceptance                 | Старое решение историческое, current stale; повторная оценка только затронутых требований, closed возвращается к пересмотру. |
| Обязательный ребёнок архивирован или закрыт с исключением | Родитель не получает успешную приёмку обходным путём.                                                                        |
| Parent ждёт child, child зависит от acceptance parent     | Общий wait-cycle отклонён; related cycle допустим.                                                                           |
| Два конкурентных cross-project dependency edges           | Оба не могут пройти проверку до записи и создать цикл; bounded incomplete scan отклоняется.                                  |
| Move с активным attempt или неверным mapping              | Ни часть дерева, ни history/ACL не переносятся; старый attempt не переписывается.                                            |
| Retry прежнего update/intake после move                   | Исходный эффект не дублируется; source identity сохранена, актуальные и исторические ACL проверены.                          |
| У нового участника нет прав на исходный проект            | Старые private events/artifacts не раскрываются через moved task или receipt.                                                |
| V1 full PATCH защищённой v2 задачи                        | Явная upgrade error, без потери результата, связей, status или acceptance.                                                   |
| Reorder и изменение bucket во время pagination            | CAS/cursor conflict, reload; нет молчаливой потери/дублирования карточек.                                                    |
| Removed assignee, revoked actor или changed grants        | История сохраняется; новое назначение/исполнение/replay content не обходят свежий admission.                                 |
| Архив/restore и локальный sync                            | Нет ложного success, автоматического запуска/очистки или второго TASK.                                                       |

ENG-16 реализует transitions/results; ENG-17 — иерархию, граф, move/order и
совместимость исторических bindings; ENG-18 — v2 facade/DTO; ENG-19 — fallback/
reconcile; ENG-20 — evidence/Git/result связи. [ENG-05](../architecture/platform-access.md#единые-инженерные-полномочия-eng-05)
задаёт credentials/scopes, [ENG-06](../architecture/engineering-operations.md) —
execution/recovery protocol и отдельную привязку результатов к задачам. §12–14 продолжают
описывать текущий установленный контракт до фактической поставки и приёмки v2.

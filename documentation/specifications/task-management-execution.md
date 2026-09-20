# Task manager — контракт исполнения и интеграции с AI

Версия: **0.8**, 2026-09-18. Статус: **проект технической части ТЗ**.
Читается вместе с [продуктовым ТЗ](task-management.md). Все новые сущности,
команды и состояния ниже — целевой контракт, а не описание готовых API.
Этот документ не меняет действующие AI rules и не разрешает запуск/публикацию кода.

## 1. Проверенное состояние и владельцы

Проверено по коду 2026-09-17. Документация текущего контура:
[интеграция Codex](../architecture/codex-integration.md),
[delivery](../delivery/02-ci-release-deploy.md).

| Область | Существующий источник | Что можно использовать |
| --- | --- | --- |
| Диалоги, сообщения, AIRun | [repository](../../packages/payload-ai-plugin/src/endpoints/repository.ts), [runs](../../packages/payload-ai-plugin/src/collections/runs.ts) | IDs, история, idempotency, контекст и run status |
| AI-конфигурация | [aiConfiguration](../../packages/ai-contracts/src/aiConfiguration.ts), [compiler](../../packages/change-engine/src/aiConfigurationCompiler.ts) | Draft, immutable release, active pointer, profiles, roles, rules, skills, templates, bindings |
| Снимок запуска | [AIChatConfiguration](../../packages/ai-contracts/src/AIChatConfiguration.types.ts), [resolver](../../packages/payload-ai-plugin/src/chat-context/resolveAIChatConfiguration.service.ts) | Серверная сборка exact release/profile и закрытый snapshot |
| Workflow definition | [workflows](../../packages/ai-contracts/src/workflows.ts), [policy](../../packages/change-engine/src/workflowPolicy.ts) | Ограниченные шаги, ветвление и проверка графа |
| Workflow continuation | [continue](../../packages/payload-ai-plugin/src/chat-context/continueWorkflow.service.ts), [dispatch](../../packages/payload-ai-plugin/src/chat-context/dispatchWorkflowSegment.service.ts) | Checkpoint, сегменты, продолжение, фактический child run |
| «Запуски процессов» | [registry](../../packages/payload-ai-plugin/src/endpoints/WorkflowRunRegistry.repository.ts), [SQL](../../packages/payload-ai-plugin/src/endpoints/workflowRunRegistry.sql.ts) | Проекция workflow по существующим AIRun |
| Code Lane | [executionHandlers](../../packages/payload-ai-plugin/src/endpoints/executionHandlers.ts), [jobRepository](../../services/ai-execution-worker/src/jobRepository.ts), [worker](../../services/ai-execution-worker/src/worker.ts) | Approved plan, durable очередь jobs, claim, исполнение, проверки и delivery |
| Reviewer и изоляция | [reviewer](../../services/ai-execution-worker/src/independentReviewer.ts), [worktree](../../services/ai-execution-worker/src/worktree.ts) | Независимая проверка и отдельный checkout |
| Provider connection | [service](../../packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnection.service.ts), [lock](../../packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnectionLock.adapter.ts) | Credentials lease, фактические модели и сериализация доступа |
| События | [stream bridge](../../packages/payload-ai-plugin/src/endpoints/stream.ts), [workflow persistence](../../packages/payload-ai-plugin/src/chat-context/persistWorkflowAgentEvent.service.ts), [RunStore](../../services/ai-control-plane/src/runStore.ts) | Формат событий, durable replay/checkpoint при обработке потока |
| Readiness | [release guard](../../packages/payload-ai-plugin/src/endpoints/releaseWorkerReadiness.validator.ts), [availability](../../packages/payload-ai-plugin/src/integrations/runtime/mapWorkerAvailability.mapper.ts) | Проверка конкретной capability и свежести worker перед принятием работы |

Наличие этих владельцев не означает готовность многоагентного task manager.

### 1.1. Обязательные разрывы между текущим кодом и целевой моделью

| ID | Сейчас | Что требуется для ТЗ |
| --- | --- | --- |
| GAP-01 | Profile — набор конфигурации; назначаемого agentID нет | Устойчивая AI-идентичность, состояние, задания, команды и adapter reference |
| GAP-02 | Workflow: 6 типов шагов, до 64 шагов; одна цепочка child на parent; agent_turn выбирает шаблон | Версионированное назначение участника/профиля на этап, fan-out/fan-in, правила собирания результатов |
| GAP-03 | Новый run требует активный release; продолжение наследует старый snapshot/model | Явное поведение queued task при смене active pointer, без молчаливой подмены |
| GAP-04 | Workflow start отклоняет attachments/projectFiles/pageDraft | Авторизованный context adapter материалов задачи и отдельное расширение input contract |
| GAP-05 | Workflow capabilities/checks обслуживают ограниченный Data Lane | Task-команды, Code Lane/handoff/check adapters и реальные receipts по новым сценариям |
| GAP-06 | Code executor использует integration model/server policy; chat profile не переносится автоматически | Проверяемое применение выбранной конфигурации по поддерживаемым lanes, без фиктивных полей UI |
| GAP-07 | Общий Codex lock и одно основное подключение; busy возвращает отказ | Durable admission, capacity-aware очередь, fairness; параллельность только при подтверждённой изоляции |
| GAP-08 | Conversation/Run/CR защищены текущим пользователем-владельцем | Командный ACL, scoped projection и service delegation без подстановки чужого req.user |
| GAP-09 | CP RunStore хранится в памяти; сохранение потока/checkpoint проходит через SSE bridge | Server-owned ingestion/reconciliation, устойчивое состояние без browser connection |
| GAP-10 | Claim Code jobs есть, общего task scheduler/lease recovery нет | Долговечный план, dependencies/resources, fencing, отмена и восстановление неизвестного исхода |
| GAP-11 | Task/assignment correlation отсутствует в строгом AI input | Типизированные ссылки на задачу/этап/попытку в контрактах и событиях |

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

| Контур поставки | Целевое условие |
| --- | --- |
| Task package | Установка npm-архива в независимый Payload-host, без workspace symlinks/alias Realize |
| Realize AI adapter | Полная интеграция с Admin Assistant обязательна для продукта; текущая основа PostgreSQL-specific |
| Другие Payload DB | Поддержка task domain проверяется отдельно; полное AI-исполнение требует совместимого runtime adapter |
| MongoDB/SQLite | Цель переносимости; не объявляются готовыми вместе с нынешним PostgreSQL-only AI adapter |
| Hosting | UI не требует shell/writable checkout; исполнение через локальный либо удалённый server adapter с нужной capability |
| UI dependencies | Общий UI-kit поставляется доступной версией либо утверждается другой единый owner; скрытого private workspace dependency нет |

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

| Состояние handoff | Контракт |
| --- | --- |
| requested | Получатель и контекст указаны; прежнее назначение не удаляется |
| accepted | Получатель или разрешённая policy принял задание; готовность агента проверена, выполнение ещё может ждать ресурс |
| applying | Для замены исполнителя подтверждается завершение/остановка старой работы; для соисполнения разделяются задания/ресурсы; конфликтующая работа не выдана |
| completed | Новое назначение и план применены атомарно, история и уведомления сохранены; можно заново пройти admission |
| declined / cancelled | Причина сохранена; старое назначение не потеряно, дублирующего исполнения нет |
| blocked / recovery_required | Отсутствует право/контекст/ресурс либо исход старого attempt неизвестен; нужна конкретная корректировка/сверка |

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

| Операция | Обязательный контракт |
| --- | --- |
| Catalog/Capabilities | Видимые агенты, конфигурации и workflows; protocol/version; supported lanes, control actions и capacity |
| Resolve/Preflight | Exact plan, readiness, scope/ACL, dependencies, resource needs и причины отказа; без side effects исполнения |
| Submit | Идемпотентная передача snapshot; accepted receipt с authoritative IDs либо однозначный отказ |
| LookupByKey/Reconcile | Найти результат submit после потери ответа; сверить внешний эффект/attempt до повтора |
| Read/Subscribe | Пагинируемые события и snapshot с cursor/sequence; server-to-server доставка не зависит от browser |
| Continue/Input | Ожидаемая версия/step и разрешённый input; новая attempt/continuation, без перезаписи прошлого |
| Pause/Cancel | Durable intent, поддерживаемая безопасная точка, подтверждённый outcome; неизвестный исход виден |
| Retry | Новая связанная попытка после проверки конфигурации/прав/эффектов; не команда сменить status на queued |
| Result/Acceptance | Версии артефактов, checks/receipts, verdict и допустимые следующие действия |

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

| Состояние task execution/stage | Семантика |
| --- | --- |
| draft / ready | План готовится / прошёл проверки для будущего запуска |
| blocked | Не выполнено конкретное prerequisite; reason и путь разрешения обязательны |
| scheduled | Запланировано на время; это не обещание доступного worker сейчас |
| queued | Готовый этап принят, ожидает разрешённый ресурс; действует queue deadline |
| dispatching | Передаётся владельцу runtime; исход восстанавливается по idempotency key |
| running | Runtime подтвердил исполнение; известны attempt/heartbeat |
| waiting_input / waiting_approval | Требуется конкретный ввод или решение; ресурсы удерживаются только по явной причине |
| pause_requested / paused | Запрошена остановка на безопасной точке / она подтверждена |
| cancel_requested / cancelled | Намерение отмены сохранено / исходный owner подтвердил остановку |
| publishing_result | Исполнение дало результат, но обязательные файлы/manifest ещё не опубликованы долговечно |
| succeeded / failed | Получен фактический результат этапа; не равняется приёмке задачи |
| recovery_required | Потеря связи/lease или неизвестный side effect; новая работа ждёт сверки |

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

| Категория / событие | Условие и эффект |
| --- | --- |
| Active | Работа/ожидание/возврат на исправление; отдельная сводка execution обязательна при наличии запуска |
| Done | Обязательные результаты исполнения сданы долговечно; может ожидаться тестирование/приёмка, что явно отображается |
| Closed / принято | Все обязательные критерии, проверки и решение принимающего действуют для текущих revisions; включая deploy, если он входит в критерии |
| Обязательный failed check | Возврат в Active/исправление; переход в Closed / принято отклоняется |
| Изменение принятого результата или критериев | Старое acceptance остаётся историческим; текущая приёмка требует пересмотра, задача возвращается в Active и не остаётся принятой по старому hash |
| Закрытие с исключением | Только отдельное разрешённое решение с причиной и verdict; не равно accepted и не удовлетворяет зависимость, требующую успешной приёмки |

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

| Данные | Источник истины |
| --- | --- |
| Проекты, задачи, назначения/handoff, task relations/conversation links, декларативный план, доступ, приёмка | Payload task domain и версии сущностей |
| Диалоги, сообщения и исходные message/run relationships | Существующий conversation owner; task хранит ссылки и разрешённый контекст |
| Переходы workflow, fan-out/join, текущий этап | Единственный workflow engine; task UI читает проекцию |
| Конфигурация AI | Существующий AI-layer release/compiler |
| Фактический run/job/checkpoint/effect | Исходный runtime owner; task хранит refs и восстанавливаемые projections |
| Метаданные файлов, revisions, hashes и права | Task artifact catalog |
| Бинарное содержимое | Закрытый storage adapter с контролируемой выдачей |
| Локальный workspace | Рабочая материализация/явно импортируемый источник, не вторая управляющая БД |
| Native agent session/SQLite registry | Собственный runtime инструментов; в task dossier только разрешённые ссылки/сводки |

Artifact metadata: ID/revision, category, filename, MIME, bytes, content hash,
storage key, author, task/execution/stage/attempt, createdAt, provenance,
input/output purpose, retention/pinned, upload/ready/rejected/deleted state.
URL/скачивание проверяют ACL; private files не попадают в публичную Media.

Локальному исполнителю выдаётся manifest выбранных файлов с hashes и целевыми
именами. Paths проверяются на traversal/symlink escape и границы assignment.
Публикация результатов проходит через artifact API с expectedRevision и
idempotency. Большие файлы загружаются потоково/частями по контракту storage.

TASK.md — читаемая проекция ревизии задания, критериев, результатов и handoff.
Статус меняется командой task API; правка markdown сама по себе его не меняет.
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

| ID | Сценарий и доказательство |
| --- | --- |
| EX-01 | Два одновременных старта одной ревизии возвращают одно execution/dispatch; для каждой разрешённой ветки ровно один исходный run/job |
| EX-02 | Ответ submit потерян после создания run: lookup/reconcile находит его, повторное исполнение не появляется |
| EX-03 | Вкладка закрыта до terminal event: очередь, история и последующие разрешённые этапы продолжаются без browser SSE |
| EX-04 | Рестарт dispatcher/CP/worker в разных фазах: состояние восстановлено либо явно recovery_required, без ложного успеха |
| EX-05 | Старый worker пишет после истечения/передачи lease: fencing отвергает результат, новый владелец не дублирует side effect |
| EX-06 | Занятый Codex: задания честно ждут один слот; разные агенты не обходят общий connection lock |
| EX-07 | Несуществующая capability, потерянный credential или stale heartbeat: actionable blocker до dispatch |
| EX-08 | Приоритеты, aging, DAG, fan-out/fan-in и partial failure проверены серверными сценариями; нет starvation/циклов |
| EX-09 | Два code assignments с пересечением scope: изоляция/сериализация; объединение повторно проходит checks/review |
| EX-10 | Профиль/команда/task revision изменены в очереди: план пересматривается; старый attempt хранит исходный snapshot |
| EX-11 | Назначенный profile/model действительно дошёл до поддерживаемого runtime lane; неподдержанный выбор отклонён, не проигнорирован |
| EX-12 | Отзыв ACL/delegation закрывает dispatch/read/write; членство задачи не раскрывает чужой личный чат или артефакт |
| EX-13 | Pause/cancel в очереди, во время turn и внешнего write имеют разные правдивые исходы; retry не отменяет прошлый audit |
| EX-14 | Artifact заменён после test/acceptance: старый verdict не распространяется на новый hash; зависимый план требует проверки |
| EX-15 | Повторные/переставленные events не создают дублей и не откатывают state; уведомления не образуют цикл observer agents |
| EX-16 | Импорт/экспорт, archive/restore и upgrade проверены на данных и внешних IDs; tmp cleanup не удаляет принятые результаты |
| EX-17 | npm archive установлен в независимый host; task-domain и полный AI adapter проверены как разные compatibility profiles |
| EX-18 | Сценарий человек/агенты на всех ролях проходит из Admin Assistant до принятого результата с досье и фактическими runs |
| EX-19 | Timeout одновременно с claim: authoritative job не выполняет просроченный эффект либо обнаруженный начавшийся исход честно проходит cancel/recovery |
| EX-20 | Падение при публикации blob/manifest: нет ложного succeeded/fan-in; публикация восстановлена, используемые версии удержаны от GC |
| EX-21 | Агент → человек → агент: сдача новой ручной версии двигает тот же workflow и сохраняет авторство; provider не требуется ручному этапу |
| EX-22 | Done/Closed и исключения одинаково проверяются во всех API/UI; изменение criteria/result не сохраняет принятие по старой версии |
| EX-23 | Many-to-many task/conversation, разные ACL, unlink и удаление источника: обратные ссылки корректны, закрытые данные не раскрыты, происхождение результата не потеряно |
| EX-24 | Конкурентное добавление A→B/B→A между проектами: один запрос отклонён; related допускает цикл и не блокирует scheduler |
| EX-25 | Повтор/гонка handoff с claim/result: один переход назначений, старый attempt не пишет от имени нового и не дублирует side effect; decline сохраняет ответственного |
| EX-26 | Делегирование соисполнителю/цепочке агентов: scope и budget не растут, независимые части работают параллельно, fan-in ждёт нужные revisions |
| EX-27 | Project/list/parent consistency проверена через UI/API/import; перенос/архив с активными runs не меняет их scope молча, ACL и весь перенос дерева согласованы |

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

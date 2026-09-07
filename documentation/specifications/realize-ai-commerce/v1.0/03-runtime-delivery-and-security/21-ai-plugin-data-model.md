# 21. AI plugin data model

- **Статус:** target specification

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

Editable entities принадлежат draft. Activation создаёт snapshot manifest с
versions/content hashes, validation/eval evidence, creator/approver и system
compatibility range.

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
conditional update по `draftID + revision`; release и event создаются атомарно.
Повтор `Idempotency-Key` допустим только для того же actor, action и canonical
request hash.

Draft lifecycle первого среза: `editing -> ready -> released`. Любая замена
artifacts снова переводит draft в `editing`; successful validation переводит
его в `ready`; release фиксирует exact ready revision и переводит aggregate в
`released`. Invalid validation не изменяет draft. Artifact revisions остаются
частью canonical content: новый artifact начинается с revision 1, неизменённый
сохраняет revision, изменённый повышает её ровно на один.

Schema для `ActiveConfigPointer` устанавливается вместе с persistence slice,
но запись pointer остаётся за отдельными activate/rollback commands следующего
среза. Наличие коллекции само по себе не делает release активным.

Эта persistence schema реализована migration
`20260901_163832_ai_config_persistence`; generated Payload types и collection
registry включают все четыре коллекции.

## 21.3. Общие инварианты

Operational collections скрыты от обычного Payload CRUD UI/API либо имеют
отдельный least-privilege access. Credentials хранятся write-only encrypted
envelopes. Audit и approvals append-only. DTO redacted и versioned.

Runs/Change Requests ссылаются на exact system/config/capability versions.
Удаление или изменение source draft не меняет исторический execution context.
Retention и hard delete определяются отдельной policy, а не cascade по запросу
модели.

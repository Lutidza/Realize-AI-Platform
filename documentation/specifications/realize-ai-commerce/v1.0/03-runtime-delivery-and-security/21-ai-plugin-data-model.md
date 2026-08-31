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
- EvalCase и EvalRun;
- AIConfigDraft и immutable AIConfigRelease;
- ActiveConfigPointer.

Editable entities принадлежат draft. Activation создаёт snapshot manifest с
versions/content hashes, validation/eval evidence, creator/approver и system
compatibility range.

## 21.3. Общие инварианты

Operational collections скрыты от обычного Payload CRUD UI/API либо имеют
отдельный least-privilege access. Credentials хранятся write-only encrypted
envelopes. Audit и approvals append-only. DTO redacted и versioned.

Runs/Change Requests ссылаются на exact system/config/capability versions.
Удаление или изменение source draft не меняет исторический execution context.
Retention и hard delete определяются отдельной policy, а не cascade по запросу
модели.

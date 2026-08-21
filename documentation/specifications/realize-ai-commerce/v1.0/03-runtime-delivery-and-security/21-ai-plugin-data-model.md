# 21. Модель данных AI-плагина

Ниже приведена целевая логическая модель. На MVP она может быть реализована Payload collections + скрытые runtime tables.

## 21.1. `realize-ai-conversations`

Поля:

- `id`;
- `title`;
- `status`: active/archived;
- `createdBy`;
- `participants`;
- `contextTarget`;
- `lastMessageAt`;
- `activeChangeRequest`;
- timestamps.

Indexes:

- createdBy + lastMessageAt;
- status + lastMessageAt.

## 21.2. `realize-ai-messages`

Поля:

- conversation;
- role;
- kind;
- content;
- structuredPayload;
- run;
- changeRequest;
- visibility;
- sequence;
- usageSummary;
- createdAt.

Content должен проходить redaction policy.

## 21.3. `realize-ai-change-requests`

Поля:

- type;
- state;
- version;
- riskLevel;
- requestedBy;
- conversation;
- originalRequest;
- normalizedIntent;
- plan;
- planHash;
- scopeManifest;
- scopeHash;
- contextPackHash;
- baseCommit;
- branch;
- affectedDocuments;
- affectedPaths;
- operationHash;
- diffHash;
- previewURL;
- releaseArtifactDigest;
- previousReleaseDigest;
- rollbackPlan;
- blockedReason;
- expiresAt;
- timestamps.

## 21.4. `realize-ai-runs`

Поля:

- changeRequest;
- stage;
- provider;
- model;
- threadID;
- sandboxProfile;
- workerID;
- status;
- attempt;
- startedAt;
- finishedAt;
- usage;
- providerCost;
- errorSummary;
- eventCursor.

## 21.5. `realize-ai-operations`

Поля:

- changeRequest;
- sequence;
- lane;
- toolName;
- inputRedacted;
- inputHash;
- idempotencyKey;
- state;
- beforeArtifact;
- afterArtifact;
- resultSummary;
- error;
- executedBy;
- timestamps.

## 21.6. `realize-ai-approvals`

Поля:

- changeRequest;
- type;
- decision;
- actor;
- roleSnapshot;
- boundHash;
- targetEnvironment;
- comment;
- expiresAt;
- createdAt;
- revokedAt.

Approval immutable; revoke создаёт отдельное событие.

## 21.7. `realize-ai-check-results`

Поля:

- changeRequest;
- run;
- stage;
- checkID;
- status;
- commandSummary;
- durationMs;
- logArtifact;
- reportArtifact;
- required;
- blocking;
- createdAt.

## 21.8. `realize-ai-deployments`

Поля:

- changeRequest;
- environment;
- releaseID;
- imageDigest;
- previousImageDigest;
- migrationSet;
- state;
- previewURL;
- initiatedBy;
- approval;
- healthSummary;
- startedAt;
- completedAt;
- rollbackOf;
- failureReason.

## 21.9. `realize-ai-audit-events`

Append-only:

- eventID;
- sequence/revision;
- aggregateType;
- aggregateID;
- eventType;
- actorType;
- actorID;
- visibility;
- summary;
- payloadRedacted;
- payloadHash;
- idempotencyKey;
- createdAt.

Update/delete access запрещён всем обычным ролям.

## 21.10. `realize-ai-usage-ledger`

Лучше хранить канонический ledger в central control plane, а в site instance — projection.

Поля central ledger:

- usageEventID;
- installationID;
- customerID;
- runID;
- provider;
- model;
- inputTokens;
- cachedInputTokens;
- outputTokens;
- toolRuntimeUnits;
- providerCost;
- platformFee;
- billableAmount;
- currency;
- pricingVersion;
- status;
- occurredAt;
- invoicedAt.

Ledger append-only.

---


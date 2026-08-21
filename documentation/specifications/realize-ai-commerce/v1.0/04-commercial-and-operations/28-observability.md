# 28. Observability

## 28.1. Correlation identifiers

Каждое событие содержит:

- installationID;
- conversationID;
- changeRequestID;
- runID;
- jobID;
- workerID;
- codexThreadID;
- deploymentID;
- releaseID;
- traceID.

## 28.2. Metrics

### Product

- active installations;
- conversations;
- change requests by type;
- approval conversion;
- preview acceptance;
- production deploys;
- rollback rate.

### AI

- runs;
- success/failure/cancel;
- input/output/cached tokens;
- provider cost;
- cost per task type;
- context pack size;
- tool call failure;
- budget stops.

### Delivery

- time to plan;
- time to preview;
- build duration;
- test pass rate;
- migration failure;
- deploy duration;
- health failure;
- rollback duration.

### Infrastructure

- queue depth;
- worker saturation;
- CPU/RAM/disk;
- DB connections;
- error rate;
- SSE disconnects;
- license renewal failure.

## 28.3. Logs

Structured JSON logs.

Запрещено логировать:

- OpenAI keys;
- capability tokens;
- cookies;
- passwords;
- full prompts с secrets;
- raw order/customer records;
- payment data.

## 28.4. Alerts

- repeated license validation failure;
- cross-installation token mismatch;
- protected path attempt;
- secret scanner finding;
- unusual AI spend;
- deployment failure;
- rollback;
- preview leak/public exposure;
- queue stuck;
- worker egress violation.

---


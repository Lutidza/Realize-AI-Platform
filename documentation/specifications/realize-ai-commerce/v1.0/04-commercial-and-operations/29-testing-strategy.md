# 29. Testing strategy

## 29.1. Unit tests

- state transitions;
- risk classifier;
- approval binding;
- hash calculation;
- idempotency;
- policy evaluator;
- tool schema validation;
- license verifier;
- pricing calculation;
- context pack compiler.

## 29.2. Payload plugin integration tests

- plugin config merge;
- enabled/disabled;
- collection injection;
- endpoint access;
- custom view import map;
- access controls;
- Local API with `overrideAccess: false`;
- transaction rollback;
- MCP short-lived auth;
- protected collections.

## 29.3. Runtime tests

- job leasing;
- duplicate delivery;
- worker crash/retry;
- cancellation;
- event ordering;
- resume from cursor;
- optimistic conflict;
- outbox replay;
- no abandoned sessions.

## 29.4. Security tests

- prompt injection in product description;
- attempt to change installation ID;
- attempt protected path write;
- expired capability token;
- replay token;
- scope expansion;
- malicious dependency request;
- approval hash mismatch;
- artifact digest mismatch;
- cross-client network attempt;
- secret exfiltration attempt.

## 29.5. E2E scenarios

1. Ask read-only question.
2. Move products with dry-run and approval.
3. Update page block and open Live Preview.
4. Create code change, build preview, accept, deploy.
5. Reject preview and request revision.
6. Cancel running job.
7. Simulate failed test.
8. Simulate failed deployment.
9. Roll back release.
10. License goes into grace.
11. Budget limit reached.
12. Two admins create conflicting changes.

## 29.6. Chaos/failure tests

- worker killed;
- queue message redelivered;
- DB unavailable;
- control plane unavailable;
- license service unavailable;
- SSE disconnected;
- preview provisioning timeout;
- registry unavailable;
- migration failure;
- health check flaps.

---


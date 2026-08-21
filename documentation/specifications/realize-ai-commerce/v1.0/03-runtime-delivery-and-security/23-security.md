# 23. Безопасность

## 23.1. Ключевой принцип

Ни tenant, ни installation, ни actor, ни права не выбираются моделью.

В single-tenant instance installation context берётся из server configuration и signed license identity.

## 23.2. Threat model

### T1. Prompt injection из CMS-контента

Mitigation:

- data is untrusted;
- system policy separate;
- tool allowlist;
- no policy changes from retrieved text;
- output validation.

### T2. Агент пытается изменить protected path

Mitigation:

- filesystem sandbox;
- writable roots;
- pre-edit allowlist;
- post-diff scanner;
- protected path CI gate.

### T3. Agent credential exfiltration

Mitigation:

- worker не получает production/OpenAI master secrets сверх необходимого;
- credentials injected only to process;
- no secrets in prompt;
- no network by default;
- log redaction;
- ephemeral worker.

### T4. Cross-client access

Mitigation:

- отдельные DB/app/repo/workspace;
- один installation per worker job;
- no cross-mount;
- capability token tied to installation/run;
- network policy;
- worker destroyed after job.

### T5. Approval spoofing

Mitigation:

- authenticated server action;
- hash binding;
- expiration;
- optimistic version;
- audit;
- role re-check at execution.

### T6. Diff changed after approval

Mitigation:

- re-hash;
- invalidate approval;
- deploy only exact artifact digest.

### T7. Arbitrary SQL/destructive data operation

Mitigation:

- typed tools;
- max document limits;
- transaction;
- dry-run;
- dual approval;
- protected collections.

### T8. Malicious dependency

Mitigation:

- dependency approval;
- registry allowlist;
- lockfile;
- vulnerability scan;
- SBOM;
- network-off build where possible.

### T9. Compromised admin account

Mitigation:

- MFA/SSO where available;
- least privilege;
- production approval separation;
- step-up auth for deploy/rollback;
- notifications;
- IP/device policies for agency operators.

### T10. License server outage

Mitigation:

- signed cached lease;
- grace period;
- no storefront shutdown;
- retry/backoff;
- status visibility.

## 23.3. Worker isolation

- rootless container;
- read-only root filesystem;
- tmpfs temporary paths;
- seccomp/AppArmor where available;
- no host Docker socket;
- no Kubernetes service account beyond job need;
- CPU/RAM/PID/disk limits;
- timeout;
- egress deny by default;
- workspace destroyed after artifact retention.

## 23.4. Secrets

Использовать secret manager.

Категории:

- OpenAI credential — central worker only;
- license signing key — License Service only;
- image signing key/workload identity — Release Service only;
- production deploy credential — Deployment Controller only;
- site DB credential — site runtime and scoped migration job only;
- Stripe vendor billing keys — Billing Service only;
- store Stripe keys — client site payment subsystem only.

Store Stripe и vendor subscription Stripe — разные аккаунты/configuration boundaries.

## 23.5. Audit и privacy

Не сохранять:

- hidden chain-of-thought;
- raw private reasoning;
- plaintext secrets;
- full database dumps;
- unnecessary PII;
- payment data;
- auth tokens.

Сохранять:

- user request;
- normalized plan;
- tool name;
- redacted input summary;
- hashes;
- diff;
- check result;
- approvals;
- usage;
- deployment result.

---


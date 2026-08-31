# 23. Security

- **Статус:** target specification

## 23.1. Trust boundaries

Недоверенными считаются actor input, model output, CMS content, knowledge
documents, code comments, uploads, external web/MCP data и preview content.
Доверенными являются только server-resolved identity, policy/license
projection, protected registries, state machine, executors и artifact
verifiers.

## 23.2. Authorization

Effective permission является пересечением actor role, installation policy,
license entitlement, capability descriptor и protected-scope policy. Любой
слой может запретить действие; нижний слой не может разрешить его обратно.

Поддерживаются `read: deny`, `read-only`, `write: scoped` и `hidden` для paths,
collections, fields, integrations и runtime resources. Denied content
фильтруется до retrieval и логирования.

## 23.3. Prompt/tool injection

Instructions из данных отделяются от system/install instructions. Tool
arguments валидируются независимо от model text. Local skill/prompt/knowledge
не может изменить identity, capability, check registry, egress или approval.
Обнаруженная попытка фиксируется как security event и может остановить run.

## 23.4. Execution security

- ephemeral workspace и least-privilege OS identity;
- path canonicalization и symlink/submodule protection;
- deny-by-default network egress;
- no Docker socket, host root или shared client secrets;
- allowlisted commands/checks без model-owned shell composition;
- output size/time limits и redaction;
- signed immutable release artifacts.

## 23.5. Credentials и audit

Credentials не попадают в DTO, prompts, diffs, logs или evidence; используется
write-only vault и short-lived injection только executor-у. Security-relevant
events append-only, correlated и защищены от изменения обычным Admin.

## 23.6. Обязательные adversarial tests

Проверяются malicious prompt/skill/knowledge, role escalation, check command
injection, hidden-resource inference, cross-installation selectors, path
traversal, stale hash replay, SSRF/egress, secret exfiltration и mismatch между
plan, preview, release и production artifact.

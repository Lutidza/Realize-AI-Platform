# 15. Pipeline: code change

## 15.1. Применение

- UI-компоненты;
- site extension;
- custom block;
- new integration adapter;
- изменение schema;
- migration;
- theme logic, которую нельзя выразить tokens;
- route/page behavior.

## 15.2. Полный процесс

### Stage 1. Base freeze

Зафиксировать:

- base repository;
- base branch;
- base commit SHA;
- lockfile hash;
- current production artifact digest;
- current schema migration head;
- current plugin versions.

### Stage 2. Scope manifest

Обязательные поля:

```yaml
source_of_truth:
  - AGENTS.md
  - documentation/project-context.md
  - selected source paths
contour_owner: active-storefront
owner_layer: site-extension
allowed_paths:
  - src/blocks/**
  - src/components/**
  - src/plugins/site/**
forbidden_paths:
  - src/plugins/realize-ai/**
  - src/access/**
  - infra/secrets/**
  - .github/workflows/release/**
  - package-lock.json unless dependency approval
planned_create: []
planned_edit: []
planned_delete: []
required_checks: []
```

### Stage 3. Plan approval

До workspace-write пользователь/оператор подтверждает:

- цель;
- scope;
- предполагаемые файлы;
- риски;
- dependency changes;
- migration need;
- expected checks.

### Stage 4. Isolated workspace

Build service создаёт:

- ephemeral container;
- read-only base checkout;
- отдельный Git worktree/branch `ai/cr-<id>`;
- отдельный unprivileged OS user;
- writable roots только из scope;
- no production secrets;
- network disabled по умолчанию;
- CPU/RAM/disk/time quotas.

### Stage 5. Implementation

Codex получает workspace-write только после gate.

Правила:

- сначала существующие patterns;
- no hidden scope expansion;
- package install только через отдельный approval;
- no commit/push на этом этапе;
- no production access;
- no modification of protected paths;
- generated files создаются только штатными commands.

### Stage 6. Self-review

- git diff;
- forbidden path detector;
- secret scanner;
- generated file policy;
- code comment discipline;
- architectural owner check;
- scope expansion detection.

### Stage 7. Automated checks

Минимум:

1. formatting/check;
2. lint;
3. TypeScript typecheck;
4. unit tests;
5. integration tests;
6. Payload config init;
7. generate types/import map check;
8. migration status;
9. Next build;
10. relevant Playwright tests;
11. dependency/security scan;
12. protected path scan.

### Stage 8. Independent review

Отдельный reviewer thread в read-only режиме проверяет:

- соответствие запросу;
- архитектуру;
- безопасность;
- data/access boundaries;
- regression risk;
- test adequacy.

Reviewer не должен быть тем же контекстом, который писал код, для R3/R4.

### Stage 9. Migration validation

Если schema изменена:

- migration file обязателен;
- запрет production schema push;
- создать sanitized DB clone;
- применить migration;
- запустить smoke/read-write checks;
- проверить backward compatibility;
- сформировать rollback/forward-fix plan.

### Stage 10. Build immutable artifact

- clean checkout exact commit;
- `npm ci`;
- reproducible build;
- OCI image;
- labels: commit, change ID, build ID, version;
- SBOM;
- vulnerability scan;
- provenance/attestation;
- signature;
- push by digest.

### Stage 11. Preview

- отдельное preview environment;
- отдельная DB clone для schema changes;
- отдельный URL;
- ограниченная авторизация;
- TTL;
- no production write access;
- E2E and smoke tests.

### Stage 12. Human acceptance

Пользователь видит preview и принимает результат.

### Stage 13. Release approval

Approval привязывается к exact image digest и migration set.

### Stage 14. Production deploy

- pre-deploy backup/checkpoint;
- health of current slot;
- migration strategy;
- deploy inactive slot;
- health checks;
- switch traffic;
- post-deploy verification;
- mark release active.

### Stage 15. Commit/push and close

Git commit/push выполняется service identity только после прохождения policy. Ветка и commit связываются с Change Request.

## 15.3. Код никогда не меняется внутри running container

Running production filesystem считается immutable.

Любое code change:

```text
Git -> Build -> Signed Image -> Deploy
```

а не:

```text
Chat -> edit files inside container -> restart
```

---


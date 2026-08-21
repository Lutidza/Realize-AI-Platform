# Phase 4. Production delivery

## 4.1. Private registry

- immutable digests;
- SBOM;
- signature;
- release manifest.

## 4.2. Blue/green deployment

- inactive slot;
- health;
- switch;
- verification;
- previous slot retention.

## 4.3. Migrations

- clone test;
- backup;
- forward migration;
- expand-contract rules.

## 4.4. Rollback

- app;
- data;
- content;
- controlled schema recovery.

## Phase 4 acceptance

- production получает exact approved digest;
- unsigned image отвергается;
- deployment audit полный;
- rollback tested;
- failure before switch не влияет на production.

---


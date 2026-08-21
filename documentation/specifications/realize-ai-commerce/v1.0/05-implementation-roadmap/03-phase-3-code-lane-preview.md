# Phase 3. Code lane и preview

## 3.1. Worktree service

- branch per change;
- path allowlist;
- protected paths;
- ephemeral worker.

## 3.2. Codex implementation mode

- planner;
- plan approval;
- workspace write;
- self-review;
- separate reviewer.

## 3.3. Full checks

- lint/typecheck/tests/build;
- Payload checks;
- Playwright;
- security;
- dependency approval.

## 3.4. Preview service

- image build;
- preview URL;
- DB clone;
- TTL;
- acceptance.

## Phase 3 acceptance

- code never edits production filesystem;
- preview создан из Git commit;
- failed check блокирует preview/release;
- forbidden path attempt блокируется;
- acceptance связан с diff/artifact.

---


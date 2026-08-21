# Phase 2. Change Engine и data lane

## 2.1. Реализовать state machine

- DB entities;
- transitions;
- optimistic locking;
- outbox;
- idempotency.

## 2.2. Реализовать risk and policy engine

- R0–R4;
- capability checks;
- approval matrix;
- budgets.

## 2.3. Реализовать typed tools

Стартовый набор:

- read product/category/page;
- explain publication state;
- update page block;
- create landing draft;
- move products;
- assign/remove category;
- update safe SEO fields;
- update theme tokens;
- configure registered module.

## 2.4. Dry-run and approval

- before/after;
- operation hash;
- approval card;
- transaction;
- verification;
- rollback snapshot.

## Phase 2 acceptance

- массовое изменение не происходит без dry-run;
- writes используют Payload access;
- all-or-nothing transaction;
- duplicate request не повторяет operation;
- rollback data operation проверен;
- protected collections недоступны.

---


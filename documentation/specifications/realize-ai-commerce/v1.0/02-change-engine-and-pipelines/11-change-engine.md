# 11. Change Engine

## 11.1. Назначение

Change Engine — единственный компонент, который управляет жизненным циклом изменения.

Он отвечает за:

- классификацию;
- риск;
- scope;
- policy;
- approvals;
- запуск jobs;
- фиксацию state transitions;
- блокировки;
- retries;
- artifact binding;
- deployment;
- rollback;
- аудит.

## 11.2. Типы Change Request

```text
QUERY
CONTENT_CHANGE
CATALOG_CHANGE
CONFIG_CHANGE
THEME_CHANGE
CODE_CHANGE
SCHEMA_CHANGE
MIXED_CHANGE
DEPLOYMENT_ONLY
ROLLBACK
AGENCY_ENGINEERING_REQUEST
```

## 11.3. Полная state machine

```text
draft
-> intake
-> clarifying
-> context_compiling
-> classifying
-> planning
-> plan_ready
-> awaiting_plan_approval
-> plan_approved
-> workspace_preparing
-> executing
-> changes_ready
-> validating
-> validation_failed | validation_passed
-> preview_building
-> preview_failed | preview_ready
-> awaiting_acceptance
-> accepted
-> release_preparing
-> release_ready
-> awaiting_release_approval
-> release_approved
-> deploying
-> deployment_failed | deployed
-> verifying
-> verification_failed | completed
```

Контрольные и terminal states:

```text
blocked
cancel_requested
cancelling
cancelled
failed
expired
superseded
rollback_requested
awaiting_rollback_approval
rolling_back
rollback_failed
rolled_back
```

## 11.4. Запрещённые переходы

Примеры:

- `draft -> deploying` запрещён;
- `plan_ready -> executing` запрещён без approval, если policy требует approval;
- `preview_ready -> deployed` запрещён без acceptance и release approval;
- `release_approved -> deploying` запрещён, если artifact digest изменился;
- `completed -> executing` запрещён; создаётся новый Change Request;
- `failed -> executing` запрещён без retry transition и новой attempt;
- `cancel_requested -> deployed` запрещён;
- `rolled_back -> completed` запрещён; rollback является отдельным terminal result.

## 11.5. State transition contract

Каждый переход содержит:

```ts
interface StateTransition {
  transitionID: string
  changeRequestID: string
  from: ChangeState
  to: ChangeState
  actorType: 'user' | 'system' | 'worker' | 'operator'
  actorID: string
  reason: string
  expectedVersion: number
  idempotencyKey: string
  payloadHash?: string
  createdAt: string
}
```

Переход выполняется транзакционно с optimistic lock по `version`.

## 11.6. Idempotency

Любой side effect получает idempotency key:

- tool operation;
- job queue;
- approval;
- build;
- image push;
- preview deploy;
- production deploy;
- usage ingestion;
- license activation.

Повтор HTTP request или worker retry не должен дважды переносить товары, списывать кредиты или запускать второй production rollout.

## 11.7. Outbox pattern

Изменение state и запись outgoing event выполняются в одной DB transaction.

Outbox worker доставляет событие в control plane. После успешной доставки event помечается delivered.

---


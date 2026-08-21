# 22. API и streaming contracts

## 22.1. Site plugin endpoints

Рабочий namespace:

```text
/api/realize-ai
```

### Conversations

```text
POST   /conversations
GET    /conversations
GET    /conversations/:id
POST   /conversations/:id/messages
POST   /conversations/:id/archive
```

### Runs

```text
GET    /runs/:id
GET    /runs/:id/events
POST   /runs/:id/cancel
POST   /runs/:id/retry
```

### Changes

```text
GET    /changes/:id
POST   /changes/:id/approve-plan
POST   /changes/:id/reject-plan
POST   /changes/:id/execute
POST   /changes/:id/accept-preview
POST   /changes/:id/reject-preview
POST   /changes/:id/approve-release
POST   /changes/:id/cancel
```

### Deployments

```text
POST   /changes/:id/deploy-preview
POST   /changes/:id/deploy-production
POST   /deployments/:id/rollback
GET    /deployments/:id
```

### Commercial status

```text
GET    /license/status
GET    /usage/summary
GET    /entitlements
```

## 22.2. Требования к endpoint

- Payload authentication;
- CSRF protection;
- access callback;
- `Idempotency-Key` для writes;
- request schema validation;
- no installation ID from request body;
- rate limit;
- audit;
- correlation ID;
- predictable error codes.

## 22.3. SSE events

Рекомендуемый browser transport первой версии — SSE.

```ts
interface AIStreamEvent {
  id: string
  sequence: number
  runID: string
  changeRequestID?: string
  type:
    | 'run.started'
    | 'assistant.delta'
    | 'assistant.completed'
    | 'plan.ready'
    | 'tool.started'
    | 'tool.completed'
    | 'check.started'
    | 'check.completed'
    | 'approval.required'
    | 'preview.ready'
    | 'deployment.updated'
    | 'usage.updated'
    | 'run.blocked'
    | 'run.failed'
    | 'run.cancelled'
  visibility: 'user-visible' | 'internal-summary' | 'redacted'
  payload: Record<string, unknown>
  createdAt: string
}
```

Client возобновляет поток через `Last-Event-ID`.

Разрыв browser SSE не считается terminal state. Пока run имеет статус `queued`
или `running`, клиент дополнительно сверяет durable projection через
`GET /runs/:id`, показывает состояние подключения и допускает ручной reconnect.
Live-текст остаётся видимым до успешной загрузки persisted conversation detail;
только после этого UI заменяет его сохранённым assistant message.

## 22.4. Central control plane APIs

- register installation;
- activate license;
- renew lease;
- fetch entitlements;
- create central run;
- submit context manifest;
- receive events;
- issue capability token;
- ingest usage;
- fetch release manifest;
- report deployment health.

Все соединения:

- TLS;
- mTLS или signed service identity;
- rotating credentials;
- audience-bound tokens;
- replay protection.

---

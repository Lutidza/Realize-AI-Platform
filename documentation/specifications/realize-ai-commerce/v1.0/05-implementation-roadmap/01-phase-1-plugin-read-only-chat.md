# Phase 1. Payload plugin и read-only chat

- **Статус:** completed

Реализованы workspace contracts, Payload AI plugin, hidden operational
collections, authenticated browser-to-Payload API, loopback development
control plane, Codex adapter, conversations/runs/events, SSE, drawer и
`/admin/ai`.

После исходного Phase 1 также добавлен approval-only Change Request foundation.
Browser не получает OpenAI credential, а read-only chat не имеет скрытого
mutation tool.

Оставшиеся UX-улучшения не возвращают фазу в состояние incomplete, если не
ломают её security/contract criteria.

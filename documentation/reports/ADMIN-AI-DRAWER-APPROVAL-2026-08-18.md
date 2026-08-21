# Admin AI drawer и approval-only Change Request

Дата: 2026-08-18  
Статус: `IMPLEMENTED AND LOCALLY VERIFIED`

## Результат

- `RealizeAIProvider` подключён через Payload `admin.components.providers` и
  монтирует один chat controller на всём `/admin/**` contour;
- плавающая кнопка открывает адаптивный Payload Drawer на любой странице
  админки; `/admin/ai` использует тот же controller в полноэкранном layout;
- сообщения, reconnect state и активный диалог не теряются при навигации между
  страницами Admin;
- UI переработан по композиционным паттернам Vercel AI Elements
  ([Conversation](https://elements.ai-sdk.dev/components/conversation),
  [Prompt Input](https://elements.ai-sdk.dev/components/prompt-input)) без
  добавления зависимости и без замены существующего защищённого SSE-контракта;
- mobile drawer занимает ширину viewport, composer и approval card остаются
  доступны без horizontal overflow.

## Change Request и граница полномочий

- ответ ассистента с точными путями проекта можно оформить как durable Change
  Request;
- server детерминированно фиксирует type, conservative risk level, exact paths,
  checks, plan hash, scope hash, version и expiration;
- plan approval/rejection сохраняется как append-only audit record и
  криптографически привязывается к request/version/plan/scope/actor/roles/time;
- optimistic `expectedVersion` и idempotency key блокируют stale/replayed
  решения; противоположное повторное решение возвращает conflict;
- карточка approval отделена от обычного сообщения и не содержит кнопки
  выполнения;
- capability policy оставляет `changeCode`, `mutateCatalog`, `mutateContent`,
  `deployPreview`, `deployProduction` и MCP выключенными.
  `POST /changes/:id/execute` не зарегистрирован и возвращает `404`.

## Durable model и API

Добавлены hidden collections:

- `realize-ai-change-requests`;
- `realize-ai-approvals`.

Реализованы endpoints:

```text
POST /api/realize-ai/conversations/:id/changes
GET  /api/realize-ai/changes/:id
POST /api/realize-ai/changes/:id/approve-plan
POST /api/realize-ai/changes/:id/reject-plan
```

Schema закреплена migration
`20260818_170919_approval_only_change_requests`; local migration status —
`Ran=Yes`, batch `2`.

## Проверки

| Gate | Результат |
| --- | --- |
| Prettier | PASS |
| ESLint | PASS: 0 errors; 129 repository warnings, target hand-written code — 0 |
| TypeScript | PASS |
| Integration | PASS: 8 files / 29 tests |
| Playwright | PASS: 3/3, включая global drawer и real approval API |
| Production build | PASS, Next.js 16.3.1 |
| Migration status | PASS: 4/4 `Ran=Yes` |

Browser evidence:

- [desktop 1440](evidence/admin-ai-chat-desktop.png);
- [mobile 390](evidence/admin-ai-chat-mobile.png).

## Не входит в milestone

- изменение файлов или Payload business collections;
- запуск shell/Codex write worker;
- preview, deploy, rollback;
- production-grade central queue/worker isolation.

Следующая безопасная граница — отдельный execution milestone с capability
token, изолированным worker, diff/check evidence и новым approval после любого
изменения plan/scope/hash.

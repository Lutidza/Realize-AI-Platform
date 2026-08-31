# 19. OpenAI Codex integration

- **Статус:** target specification
- **Провайдер V1:** OpenAI Codex

## 19.1. Adapter boundary

Browser никогда не вызывает Codex напрямую. AI Orchestrator использует
server-side adapter, который скрывает provider protocol от Change Engine.

Для глубокой интерактивной интеграции с sessions, approvals и streamed events
ориентиром является [Codex App Server](https://developers.openai.com/codex/app-server).
Для программных jobs и CI допустим
[Codex SDK](https://developers.openai.com/codex/sdk). Выбор транспорта не
изменяет server-owned policy и approvals Realize.

## 19.2. Authentication

Production credential хранится только в доверенном central execution boundary.
Поддерживаемый способ выбирается оператором согласно
[официальной документации authentication](https://developers.openai.com/codex/auth).
API key, access token или cached user session нельзя передавать browser-у,
site image, prompt, logs или client repository.

Loopback development adapter может использовать локальную пользовательскую
Codex authentication, но не считается production topology.

## 19.3. Execution contract

Adapter получает bounded Context Pack, capability/tool projection, sandbox
profile, timeout и correlation IDs. Он возвращает structured events, tool
requests, usage и final result. Любой tool request повторно валидируется
Realize; текстовая уверенность модели не является evidence.

Thread/session IDs являются operational references, не authority. Resume
допустим только с теми же installation, actor policy, config hash и aggregate
version либо через новый run.

## 19.4. Security

Sandbox, approvals и network controls сверяются с
[Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
и [Sandboxing](https://developers.openai.com/codex/sandboxing). Продуктовые
ограничения Realize остаются дополнительным обязательным слоем.

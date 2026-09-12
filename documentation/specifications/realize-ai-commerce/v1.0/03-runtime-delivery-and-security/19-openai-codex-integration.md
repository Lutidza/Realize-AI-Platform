# 19. OpenAI Codex integration

- **Статус:** target specification
- **Провайдер V1:** OpenAI Codex
- **Дата сверки реализации:** 10 сентября 2026 года

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

В текущем чате Payload сохраняет закрытый snapshot выбранного профиля
в `runs.turnContext.agentConfiguration` и передаёт его control plane.
`runtimeContextHash` учитывает compiled config hash, модель, server developer
instructions с web-search policy и версию политики контекста. Совпадение
fingerprint с последним завершённым run позволяет использовать его thread;
при смене конфигурации или политики создаётся новый thread. В него передаются
только сохранённые реплики пользователя и ассистента как недоверенная история
до 32 КиБ UTF-8; старые developer instructions не переносятся.

Renderer профиля ограничен 128 КиБ UTF-8, а собранный JSON с
`developerInstructions` и `prompt` — 256 КиБ UTF-8. Превышение отклоняет запуск.
Профиль дополняет инструкции внутри текущей read-only policy, не выдаёт tools
или write authority и не запускает декларативный workflow. Точный состав
поддержанных шаблонов и переменных описан в
[контракте AI-layer](../01-architecture/10-ai-codex-layer-integration.md#107-текущий-chat-runtime).

## 19.4. Security

Sandbox, approvals и network controls сверяются с
[Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
и [Sandboxing](https://developers.openai.com/codex/sandboxing). Продуктовые
ограничения Realize остаются дополнительным обязательным слоем.

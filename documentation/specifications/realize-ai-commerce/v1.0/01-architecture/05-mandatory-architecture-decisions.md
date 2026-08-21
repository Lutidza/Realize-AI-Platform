# 5. Обязательные архитектурные решения

Ниже перечислены решения, которые считаются принятыми для первой версии.

## ADR-001. Single-tenant site runtime

Каждый клиентский магазин — отдельное приложение и отдельная база.

## ADR-002. Central AI execution

Codex выполняется на доверенной инфраструктуре агентства. Клиентский сайт не хранит постоянный OpenAI credential.

## ADR-003. Declarative-first changes

Агент сначала пытается выполнить запрос через:

1. content/data operations;
2. plugin/module configuration;
3. design tokens;
4. page/block composition;
5. только затем — code generation.

## ADR-004. Chat is not an executor

Chat endpoint не имеет прямого доступа к shell, Git, SQL или production deployment.

## ADR-005. Server-enforced state machine

Состояния и переходы определяет Change Engine. Модель не может произвольно установить статус `approved`, `deployed` или `completed`.

## ADR-006. Immutable approved artifact

В production попадает только тот image digest, который был создан, протестирован и одобрен. После approval повторная сборка запрещена.

## ADR-007. Separate data and code lanes

Изменение контента/каталога и изменение кода проходят разные пайплайны и разные политики.

## ADR-008. No raw SQL by default

Модель использует типизированные инструменты. SQL разрешён только специальной инженерной роли в изолированной среде и не является пользовательской функцией MVP.

## ADR-009. Payload access controls remain authoritative

Все CMS-операции выполняются с `req`, `overrideAccess: false` и, для writes, `overrideLock: false`.

## ADR-010. Existing `.ai` is the instruction source of truth

Новая система компилирует Context Pack из текущих rules/workflows/checks, а не создаёт параллельный набор prompts.

## ADR-011. Core platform is protected

Обычный клиентский AI-run не может менять:

- license verification;
- billing;
- auth/access control;
- deployment credentials;
- core package source;
- payment logic;
- central control plane;
- protected CI/security files.

## ADR-012. License outage must not stop storefront

Недоступность License Service не должна выключать публичный магазин, корзину, заказы или доступ клиента к собственным данным. После grace period блокируются AI, новые deploys и premium updates, но не storefront.

## ADR-013. npm and Node 24 LTS

Целевой package manager первой версии — npm. Node фиксируется на tested Node 24 LTS patch release во всех локальных, CI и production images.

## ADR-014. Multi-tenant CMS postponed

Payload Multi-Tenant Plugin не используется в первой версии клиентских сайтов. Возврат к этому вопросу допустим только после зрелости pipeline и фактического подтверждения необходимости.

---


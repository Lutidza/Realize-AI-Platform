# 3. Scope первой промышленной версии

## 3.1. Входит в scope

### CMS и e-commerce

- Payload CMS 3 как ядро;
- Next.js App Router;
- PostgreSQL;
- товары, категории, страницы, медиа;
- готовый ecommerce plugin Payload;
- формы и SEO;
- существующие блоки и виджеты;
- управляемая тема и design tokens;
- история версий контента;
- preview;
- роли и права.

### AI

- OpenAI Codex как единственный провайдер первой версии;
- собственный `.ai` operational layer;
- `.codex` как адаптер;
- browser chat;
- чтение проекта и CMS-данных;
- планирование;
- безопасные data operations;
- безопасные code operations;
- потоковые события;
- журнал запусков;
- оценка и учёт стоимости.

### Delivery

- Git-based changes;
- изолированные workspaces;
- линтер, typecheck, unit/integration/e2e;
- migration checks;
- preview environment;
- approval;
- immutable image;
- production deployment;
- rollback;
- audit.

### Commercial layer

- activation;
- signed license lease;
- subscription entitlements;
- usage accounting;
- plan limits;
- grace period;
- central release channel.

## 3.2. Не входит в первую версию

- общая multi-tenant CMS-база для всех клиентов;
- свободное подключение любых LLM-провайдеров;
- передача клиентам постоянных OpenAI credentials;
- самостоятельный клиентский root-доступ к AI worker;
- прямое выполнение произвольного SQL моделью;
- прямой shell-доступ из браузерного чата;
- автоматические финансовые операции, возвраты или списания;
- автоматическое изменение пользователей, ролей, лицензирования или платёжных секретов;
- автоматическое изменение core-пакетов платформы по запросу обычного клиента;
- бесконтрольный deploy без одобрения;
- полноценный marketplace сторонних плагинов;
- self-hosted AI execution на недоверенной клиентской инфраструктуре.

---


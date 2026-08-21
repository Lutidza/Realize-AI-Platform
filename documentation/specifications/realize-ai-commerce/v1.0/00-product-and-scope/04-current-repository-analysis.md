# 4. Анализ текущего репозитория

## 4.1. Сильные стороны текущей базы

В текущем репозитории уже присутствует значительная часть фундаментальных решений:

1. Payload CMS 3 и Next.js App Router.
2. PostgreSQL adapter.
3. Ecommerce, SEO и Form Builder plugins.
4. Каталог, страницы, категории, медиа и пользователи.
5. Готовые UI-блоки, включая carousel, forms и content blocks.
6. Корневой `AGENTS.md`.
7. Разделение `.ai` active layer и `.codex` adapter layer.
8. Роли, workflows, rules, checks, templates и registry.
9. Pre-edit Gate с source of truth, owner-layer и allowlist.
10. AI delivery state machine.
11. Локальный agent runtime с:
    - sessions;
    - jobs;
    - worker groups;
    - messages;
    - notifications;
    - presence;
    - processes;
    - event log;
    - operator commands;
    - acceptance evidence.
12. Отдельный agent monitor.
13. Codex MCP configuration для Playwright, Tailwind, Next DevTools и Payload.

Ключевой вывод: существующий `.ai` слой не нужно заменять «простым RAG». Его необходимо превратить в машинно исполняемый product runtime.

## 4.2. Критические расхождения текущего состояния

### P0-1. Два архитектурных контура

Документация и AI-правила считают каноническим доменным слоем `src/domain/**`, однако такой директории в репозитории нет.

При этом большая доменная реализация находится в `src/RealizeCore/**`.

Следствие:

- AI получает неверную карту проекта;
- allowlist и owner-layer могут указывать на несуществующие пути;
- агент способен создать третий параллельный контур;
- изменения становятся непредсказуемыми.

Обязательное решение Phase 0: выбрать один активный продуктовый контур и синхронизировать документацию.

### P0-2. `src/app/_realize/**` не является обычным route group

В Next.js route group обозначается скобками, например `(realize)`. Папки с префиксом `_` считаются private folders и исключаются из маршрутизации.

В репозитории существует крупный маршрутный контур `src/app/_realize/**`, который по текущим правилам Next.js не должен становиться публичными маршрутами.

Обязательное решение:

- либо признать этот контур legacy/experimental и явно изолировать;
- либо переименовать и полноценно активировать после отдельного архитектурного решения;
- не смешивать его с текущим `(app)` автоматически.

### P0-3. Payload MCP объявлен, но не реализован в приложении

`.codex/config.toml` ожидает `http://127.0.0.1:3000/api/mcp` и `PAYLOAD_MCP_API_KEY`.

Текущий `payload.config.ts` содержит пустой `endpoints: []`, а пакет официального Payload MCP plugin не указан в зависимостях.

Следствие: Codex configuration декларирует инструмент, которого фактически нет.

### P0-4. Нет промышленного delivery-контура

В репозитории не обнаружены:

- Dockerfile;
- docker-compose;
- CI workflow;
- release workflow;
- deployment manifests;
- migrations directory;
- production rollout strategy;
- image signing;
- artifact registry configuration.

### P0-5. Тестовые скрипты есть, тестов нет

`package.json` содержит integration и e2e scripts, но соответствующих test files нет.

Playwright ожидает `tests/e2e`, Vitest — `tests/int/**/*.int.spec.ts`.

### P0-6. Package manager drift

Основной проект использует `package-lock.json` и npm, а Playwright webServer запускает `pnpm dev`.

Это делает локальную и CI-среду неодинаковой.

### P0-7. Node version drift

Корневой проект допускает Node `>=18.20.0`, а `.ai/tools/agent-runtime` требует Node `>=24.2.0`.

Целевая среда должна быть унифицирована. Для новой платформы фиксируется Node 24 LTS на конкретной patch-версии образа.

### P0-8. Отсутствуют канонические документы, на которые ссылается runtime

Runtime-код ссылается, в частности, на:

- `DOC-SYSTEM-SPEC-031`;
- `DOC-SYSTEM-SPEC-032`;
- `DOC-SYSTEM-SPEC-042`;
- `documentation/INDEX.md`.

Эти документы в переданном архиве отсутствуют.

Следствие: runtime реализован, но его owner-spec отсутствует в source of truth.

### P0-9. Вероятные ошибки базовой сборки

Статический анализ выявляет ссылки на отсутствующие или несовпадающие пути, например:

- `@/lib/utils` при наличии `src/utilities/cn.ts`, но отсутствии `src/lib/utils.ts`;
- отсутствующий `../Card` в `CollectionArchive`;
- ряд ссылок внутри `RealizeCore` на несуществующие типы/файлы;
- root `tsconfig` включает `**/*.ts` и `**/*.tsx`, в том числе исходники вложенного Vite agent monitor с собственным alias `@/*`.

Фактический build в анализируемой среде не был подтверждён из-за недоступности npm registry, поэтому Phase 0 обязан считать текущую собираемость неподтверждённой.

### P1-1. Нет корневого README

`AGENTS.md` и `.ai/README.md` ссылаются на `README.md`, но файл отсутствует.

### P1-2. Текущая лицензия репозитория не соответствует коммерческой модели

`package.json` содержит `license: ISC`. Для закрытого коммерческого продукта требуется:

- собственный proprietary license identifier;
- EULA/договор;
- корректные notices для MIT-зависимостей;
- политика распространения образов и пакетов.

### P1-3. IDE metadata частично хранится в репозитории

`.idea/**` присутствует, а `.gitignore` исключает только `workspace.xml`.

### P1-4. Critical dependencies заданы через caret

Для production image воспроизводимость обеспечивается lockfile, но для product release необходимо дополнительно:

- фиксировать tested matrix;
- использовать controlled dependency update workflow;
- не обновлять Payload/Next/Codex автоматически при каждом build.

## 4.3. Вывод по репозиторию

Репозиторий является хорошей экспериментальной и архитектурной базой, но **не должен сразу получать browser-to-production AI pipeline**.

До реализации AI-плагина необходимо завершить Baseline Stabilization. Иначе новый runtime будет автоматизировать нестабильную и противоречивую основу.

---


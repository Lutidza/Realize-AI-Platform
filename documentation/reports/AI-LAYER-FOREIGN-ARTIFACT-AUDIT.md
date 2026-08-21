# Аудит AI-layer на чужие и устаревшие артефакты

Дата: 2026-08-17  
Scope: `AGENTS.md`, active `.ai/**` и `.codex/**` без runtime state, research
corpus, lockfiles и generated artifacts  
Режим: read-only; находки не исправлялись

## Итог

Статус: `FAILED — active AI-layer требует отдельной cleanup-задачи`.

Найдены два подтверждённых класса чужого/перенесённого project identity и два
класса structural drift. Массовая замена не выполнялась, потому что запрос был
на проверку, а исправление затрагивает active rules, checks, tools, registry и
Codex adapters одновременно.

## 1. Broken canonical references — high

- 107 ссылок в 75 active файлах указывают на отсутствующие документы
  `documentation/project/specs/ai-engineering-workflow/DOC-SYSTEM-SPEC-031`,
  `032`, `033` или `042`.
- Каталога `documentation/project/specs/ai-engineering-workflow/` в текущем
  проекте нет.
- Примеры владельцев: `.ai/tools/agent-runtime/**`,
  `.ai/tools/agent-monitor/**`, `.ai/workflows/ai-operations/**`,
  `.ai/templates/roles/**` и `.ai/checks/self-review/**`.

Это runtime dependency на отсутствующий source of truth, а не безобидная
историческая ссылка.

## 2. Foreign `recommerce-*` identity — high

Найдено 15 идентификаторов в 5 active файлах:

- `.codex/config.toml` — четыре MCP server aliases;
- `.codex/README.md` и `.codex/STRUCTURE.md` — те же adapter names;
- `.ai/tools/agent-search/package.json` — `recommerce-ai-agent-search`;
- `.ai/tools/agent-runtime/package.json` — `recommerce-ai-agent-runtime`.

Каноническая identity репозитория — `Realize-E-Commerce`; поэтому эти имена
классифицированы как перенесённые из другого проекта.

## 3. Неверный documentation contour — medium

Active rule/check/skill для code comments требует `docs/**`, хотя каноническая
документация текущего проекта находится в `documentation/**`. Всего поиск
обнаружил 22 упоминания `docs/`; часть относится к общим фразам, но прямой
конфликт подтверждён минимум в:

- `.ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md`;
- `.ai/checks/development/CHECK-CODE-COMMENT-DISCIPLINE.md`;
- `.codex/skills/code-comment-discipline/SKILL.md`.

Также `.ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md` и его
исполняемый owner `.ai/tools/agent-search/bin/agent-search.mjs` содержат
hardcoded `docs/...` paths, отсутствующие в текущем дереве.

## 4. Target paths, не совпадающие с active contour — medium

В 18 active файлах есть ссылки на `src/domain/**`, `src/ui/**` или
`src/app/api/**`, которых сейчас нет как owners. Фактические owners находятся
в `src/components/**`, route groups `src/app/(app)/**`, Payload plugin package
и workspace contracts. `src/migrations/**` теперь существует и больше не
является drift.

Часть этих путей может быть target architecture, а не чужим артефактом. До
решения owner-а их нельзя механически заменять.

## 5. Не классифицировано как foreign

`.ai/research/gruns-*` явно описывает Grüns как ecommerce reference и запрещает
копирование бренда/контента. Это пользовательский research corpus текущего
проекта, поэтому он не помечен как чужой без решения owner-а.

## Рекомендуемый cleanup order

1. определить судьбу и восстановить либо удалить зависимости на specs
   `031/032/033/042`;
2. атомарно переименовать `recommerce-*` во всех config/docs/package owners;
3. привести `docs/**` к каноническому `documentation/**` и обновить comment
   discipline rule/check/skill вместе;
4. решить, какие `src/domain/src/ui/src/app/api` paths являются target-only, и
   отделить их от active routing;
5. запустить registry/link/path checks и только затем закрывать audit.

Удалять отдельные ссылки без синхронизации registry, workflows, roles и
`.codex` adapters нельзя.

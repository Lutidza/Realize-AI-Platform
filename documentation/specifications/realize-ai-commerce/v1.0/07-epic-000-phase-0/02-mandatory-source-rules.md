# 2. Обязательные исходные правила

## 2.1. Сначала прочитай источники истины

До анализа и редактирования открой в указанном порядке:

1. `AGENTS.md`;
2. `.ai/README.md`;
3. `.ai/STRUCTURE.md`;
4. `.ai/system/INDEX.md`;
5. `.ai/system/state-machine.md`;
6. `documentation/project-context.md`;
7. `documentation/architecture/project-structure.md`;
8. `.ai/roles/role-groups.md`;
9. подходящие role cards;
10. `.ai/workflows/INDEX.md`;
11. workflow для архитектурного изменения и основного delivery;
12. `.ai/registry/rules/INDEX.md`;
13. применимые rules/checks;
14. `.codex/README.md`;
15. `.codex/STRUCTURE.md`;
16. `.codex/config.toml`;
17. применимые `.codex/agents/**`, `.codex/prompts/**`, `.codex/skills/**`.

Нельзя считать, что краткое содержание этого промпта заменяет чтение active AI-layer.

## 2.2. Не имитируй проверки

Запрещено писать, что команда, тест, build, migration, Docker build или browser check выполнены, если они фактически не запускались и не завершились соответствующим результатом.

Для каждой проверки зафиксируй один из статусов:

- `passed` — команда действительно завершилась успешно;
- `failed` — команда была запущена и завершилась ошибкой;
- `blocked` — команда не могла быть запущена из-за конкретного внешнего или инфраструктурного блокера;
- `not_applicable` — проверка объективно неприменима к текущему scope;
- `deferred_by_scope` — проверка осознанно отложена и не входит в Phase 0.

## 2.3. Не расширяй архитектуру скрыто

Запрещено:

- создавать третий параллельный продуктовый contour;
- массово переносить `src/RealizeCore/**` без ADR;
- удалять `src/RealizeCore/**` как «неиспользуемый мусор» без доказательств;
- активировать `src/app/_realize/**` простым переименованием без анализа маршрутов и конфликтов;
- смешивать элементы разных contour в одну реализацию без явного архитектурного решения;
- менять стек Payload CMS 3 + Next.js App Router + PostgreSQL;
- устанавливать зависимости без проверки актуальной версии, совместимости и фиксации причины;
- начинать AI chat, MCP writes, Codex worker, licensing или production delivery.

## 2.4. Не трогай production

В рамках Phase 0 работа выполняется только в локальном/изолированном repository workspace.

Запрещены:

- production credentials;
- production database access;
- production deploy;
- push без разрешённого delivery workflow;
- изменение live infrastructure;
- отключение security checks ради зелёного build.

---


# 4. Обязательный Pre-edit Gate

До первого изменения файла сформируй и выведи артефакт:

`documentation/reports/EPIC-000-PRE-EDIT-GATE.md`

Минимальная структура:

```markdown
# EPIC-000 Pre-edit Gate

## Task
## Source of truth
## Current repository revision
## Selected role group and roles
## Selected workflows
## Applicable rules and checks
## Active contour hypothesis
## Contour owner
## Owner layers
## Scope
## Path allowlist
## Planned create
## Planned edit
## Planned delete
## Explicit non-goals
## Commands/checks to run
## External blockers
## Decisions requiring human approval
## Risk classification
## Rollback strategy
```

Требования:

- укажи точный commit SHA или явно зафиксируй, что Git metadata недоступны;
- отдели подтверждённые факты от гипотез;
- никакого удаления файлов на первом проходе;
- allowlist должен быть минимальным;
- если для правильного решения нужен путь вне allowlist, сначала обнови gate и зафиксируй scope expansion;
- любое изменение dependency или package manager требует отдельного пункта с обоснованием;
- любые несовместимые варианты active contour должны быть представлены как решение для ADR, а не скрытая импровизация.

После создания gate продолжай без ожидания дополнительного подтверждения только в пределах безопасных, обратимых и заранее указанных действий Phase 0. Решения, которые необратимо меняют продуктовый contour, оставляй как ADR со статусом `proposed`, если они не следуют однозначно из текущей реализации.

---


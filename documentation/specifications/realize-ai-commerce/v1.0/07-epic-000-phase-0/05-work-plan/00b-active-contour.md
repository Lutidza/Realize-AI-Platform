# Этап 0B. Решение по active contour

Подготовь `ADR-0001-active-product-contour.md` по шаблону:

```markdown
# ADR-0001: Active product contour

## Status
proposed | accepted

## Context
## Evidence
## Options considered
### Option A
### Option B
### Option C
## Decision
## Consequences
## Migration/quarantine plan
## Reversal conditions
## Follow-up tasks
```

Рекомендуемая стартовая гипотеза:

- текущий рабочий e-commerce contour, связанный с фактическим `payload.config.ts`, основными коллекциями, plugin index и активным storefront, остаётся canonical;
- `src/RealizeCore/**` и `src/app/_realize/**` переводятся в логический quarantine/experimental status без автоматического удаления;
- документация и AI-layer должны перестать описывать отсутствующие paths как уже существующую production-архитектуру;
- полезные части experimental contour переносятся позже отдельными задачами после доказанного owner analysis.

Не принимай эту рекомендацию, если фактический import graph доказывает обратное. В таком случае зафиксируй решение на основе evidence.


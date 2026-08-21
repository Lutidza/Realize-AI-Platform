# 10. Формат финального отчёта

Создай `documentation/reports/EPIC-000-FINAL-REPORT.md`:

```markdown
# EPIC-000 Final Report

## Executive summary
## Repository revision
## Scope completed
## Scope not completed
## Final active contour
## Files created/changed/deleted
## ADR decisions
## Build and test matrix
## Docker verification
## Migration verification
## MCP decision and verification
## Security findings
## Known limitations
## External blockers
## Risks carried into Phase 1
## Rollback instructions
## Recommended Phase 1 entry gate
## Exact next command/task
```

Build/test matrix:

| Check | Command | Status | Evidence | Notes |
|---|---|---|---|---|
| Node guard | ... | passed/failed/blocked | ... | ... |
| Install | ... | ... | ... | ... |
| Lint | ... | ... | ... | ... |
| Typecheck | ... | ... | ... | ... |
| Integration | ... | ... | ... | ... |
| Migrations | ... | ... | ... | ... |
| Build | ... | ... | ... | ... |
| Playwright | ... | ... | ... | ... |
| Docker build | ... | ... | ... | ... |
| Compose smoke | ... | ... | ... | ... |
| MCP smoke | ... | ... | ... | ... |

Финальный ответ пользователю должен быть кратким и фактическим:

- что сделано;
- какой contour выбран;
- какие проверки реально прошли;
- какие проверки заблокированы;
- какие риски остались;
- готов ли репозиторий к Phase 1.

Нельзя объявлять готовность к Phase 1 при красном build, неподтверждённой миграции или недокументированной архитектурной развилке.

---


# 7. Артефакты результата

К завершению EPIC-000 должны существовать:

```text
README.md
documentation/INDEX.md
documentation/reports/EPIC-000-PRE-EDIT-GATE.md
documentation/reports/EPIC-000-REPOSITORY-AUDIT.md
documentation/reports/EPIC-000-IMPORT-GRAPH-SUMMARY.md
documentation/reports/EPIC-000-EXECUTION-LOG.md
documentation/reports/EPIC-000-FINAL-REPORT.md
documentation/adr/INDEX.md
documentation/adr/ADR-0001-*.md ... ADR-0008-*.md
documentation/getting-started/local-development.md
documentation/getting-started/environment.md
documentation/architecture/runtime-boundaries.md
documentation/architecture/plugin-strategy.md
documentation/architecture/ai-platform-target.md
documentation/delivery/build-and-test.md
documentation/delivery/migrations.md
documentation/delivery/docker.md
Dockerfile
.dockerignore
compose.yaml или docker-compose.yml
.github/workflows/<baseline-ci>.yml
src/migrations/**
реальные integration/e2e tests
version pin/guard files
```

Фактические имена могут быть адаптированы к действующим conventions, но отклонение нужно объяснить в final report.

---


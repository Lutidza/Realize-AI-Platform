# Этап 0J. CI baseline

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Добавь CI workflow для pull request и main branch, который выполняет:

1. checkout без сохранения лишних credentials;
2. установку exact Node version;
3. npm cache;
4. clean install по lockfile;
5. version guard;
6. lint;
7. typecheck;
8. integration tests с PostgreSQL service;
9. migration test на пустой DB;
10. production build;
11. Playwright smoke;
12. artifact upload для отчётов при failure;
13. secret-safe logs.

Не добавляй production deployment в Phase 0.

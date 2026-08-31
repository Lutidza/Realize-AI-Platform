# 11. Жёсткие запреты

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

1. Не начинай реализацию `/admin/ai`.
2. Не создавай Change Engine.
3. Не подключай OpenAI key к клиентскому приложению.
4. Не запускай Codex из Next.js request handler.
5. Не создавай generic raw SQL/MCP write tools.
6. Не давай модели unrestricted Payload CRUD.
7. Не реализуй licensing server в Phase 0.
8. Не реализуй subscription billing в Phase 0.
9. Не реализуй production deploy.
10. Не переезжай на multi-tenant.
11. Не удаляй `RealizeCore` без отдельного принятого решения.
12. Не активируй `_realize` переименованием «для проверки» в canonical branch.
13. Не ослабляй TypeScript/lint/access, чтобы скрыть ошибку.
14. Не редактируй generated Payload types/import map вручную.
15. Не записывай secrets в git, docs, logs или image.
16. Не коммить build artifacts, runtime DB, Playwright reports или agent session state.
17. Не обновляй всё дерево dependencies без отдельного scope.
18. Не выдавай предполагаемый результат команды за фактический.
19. Не скрывай blockers.
20. Не продолжай к Phase 1 автоматически.

---

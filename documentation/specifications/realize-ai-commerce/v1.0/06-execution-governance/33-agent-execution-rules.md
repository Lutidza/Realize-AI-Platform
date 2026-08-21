# 33. Жёсткие правила для AI-агента-исполнителя

1. Не изменять production.
2. Не выполнять commit/push без соответствующего workflow и approval.
3. Не создавать новый architecture contour.
4. Не считать `src/domain` существующим, пока это не подтверждено.
5. Не переименовывать `RealizeCore` массово без ADR.
6. Не активировать `_realize` простым rename без проверки route conflicts.
7. Не устанавливать dependency без version evidence и approval.
8. Не добавлять OpenAI key в site app.
9. Не реализовывать raw SQL tool.
10. Не давать generic CRUD model capability по всем collections.
11. Не обходить Payload access control.
12. Не запускать Codex из HTTP request process.
13. Не считать chat message approval.
14. Не деплоить artifact, отличный от approved digest.
15. Не отключать storefront из-за license outage.
16. Не хранить chain-of-thought.
17. Не обещать выполненные тесты, если они не запускались.
18. При blocker переводить Change Request в `blocked`, а не импровизировать.
19. Любое scope expansion требует нового plan hash и approval.
20. Core platform change маршрутизировать агентству.

---


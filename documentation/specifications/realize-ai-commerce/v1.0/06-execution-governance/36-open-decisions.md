# 36. Открытые решения, которые нужно зафиксировать до Phase 1

1. Какой contour является продуктовым: `(app)` или `RealizeCore`?
2. Где будут размещаться central services?
3. Один Git repo на клиента или иной fleet model?
4. Какой CI provider используется?
5. Какой container registry используется?
6. Какой preview orchestrator используется: Docker hosts, Nomad или Kubernetes?
7. Какой secret manager используется?
8. Какой central queue используется?
9. Какой billing provider используется для подписки агентства?
10. Какие collections разрешены AI writes в pilot?
11. Какие операции требуют dual approval?
12. Какой срок retention prompts/events?
13. Какие географии и privacy requirements применимы?
14. Какой SLA продаётся клиентам?
15. Какой release cadence для core packages?

Эти вопросы не блокируют архитектуру документа, но должны стать ADR перед соответствующей реализацией.

---


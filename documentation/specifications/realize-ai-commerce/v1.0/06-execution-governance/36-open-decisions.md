# 36. Open decisions

- **Статус:** target decisions requiring later ADR
- **Правило:** до ADR действует указанный safe default

1. **Packaging новых project profiles.** Default: versioned first-party
   packages; непроверенный marketplace не включён.
2. **Central worker orchestration после pilot.** Default: trusted agency-owned
   worker pool; client-hosted execution запрещён.
3. **Knowledge storage/search provider.** Default: installation-isolated
   storage и server-filtered retrieval; cross-installation index запрещён.
4. **Long-term audit retention.** Default: immutable minimum, заданный
   operator policy; hard delete требует legal/security decision.
5. **Production rollout strategy beyond single host.** Default: текущий
   exact-digest VPS workflow; Kubernetes/multi-region не вводятся заранее.
6. **Дополнительные LLM providers.** Default: OpenAI Codex only in V1.
7. **Marketplace и third-party executable skills.** Default: запрещены;
   допускаются только reviewed server-owned capabilities.

Эти вопросы не разрешают ослаблять существующие security, isolation,
approval или recovery contracts.

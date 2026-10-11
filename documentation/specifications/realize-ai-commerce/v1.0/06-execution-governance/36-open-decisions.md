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
   Model Garden/Model Router проектируются как расширяемые контракты, но
   это не допускает новый production provider автоматически.
7. **Marketplace и third-party executable skills.** Default: запрещены;
   допускаются только reviewed server-owned capabilities.
8. **Физическая поставка и обновление ядра клиентского проекта.** До PLAT-09
   требуется ADR с выбором package/source distribution на основе текущих
   build/release owners. Default: exact manifest, явная установленная основа,
   project extensions и отказ от автоматической перезаписи локальных правок.
   Универсальный `git pull` клиентского проекта не является update protocol.
9. **Окно поддержки и прекращение совместимости.** До первой внешней поставки
   требуется ADR с поддерживаемыми версиями и сроками. Default: разрешены
   только явно перечисленные совместимые сочетания; неизвестная версия
   не принимается как совместимая.
10. **Пороги routing/evals и коммерческие единицы.** До активации конкретной
    policy задаются task-specific качество, latency, бюджеты, правила
    fallback и подтверждённые тарифы. Default: явная проверенная модель,
    ограниченные попытки, неизвестная цена не равна нулю; usage, себестоимость
    и коммерческое начисление учитываются раздельно.
11. **Способ авторизации Git provider и доставка CI-шаблонов.** До GIT-02/GIT-03
    требуется ADR о типах подключений, хранении/ротации credentials и доверенных
    identities. Default: существующий GitHub adapter, отдельные системные и
    клиентские подключения, минимальные права на конкретные репозитории и refs;
    централизованно проверяемый versioned check pack. Выбор GitHub App/token
    или другого транспорта не объединяет полномочия. Расширение списка
    production providers требует отдельного решения.

Эти вопросы не разрешают ослаблять существующие security, isolation,
approval или recovery contracts.

# Phase 6. Hardening и pilot

- **Статус:** planned

Фаза переводит target capabilities в промышленную эксплуатацию на 5–10
изолированных сайтах.

Обязательны:

- threat model/red-team по prompt/tool/knowledge injection;
- restore, application rollback и incident drills;
- queue/worker/control-plane failure tests;
- SLO dashboards, alerts и capacity/cost budgets;
- data retention, audit export и operator escalation;
- upgrade compatibility system layer ↔ installation config releases;
- profile-specific browser/business acceptance;
- подтверждение отсутствия cross-installation access.
- центральная граница системного AI до первого внешнего подключения;
- upgrade двух поддерживаемых выпусков с локальной доработкой, конфликтом
  и проверенным восстановлением по manifest;
- приёмка model/catalog/router versions и fallback без повторного side effect;
- аналитика качества и полной стоимости результата с полнотой usage/reconciliation.

Pilot считается успешным только по измеримым SLO и recovery evidence. Наличие
функции в Admin или один демонстрационный run недостаточны.

Зависимости и граница первой поставки определены в
[PLAT-10–PLAT-12](../06-execution-governance/32-immediate-implementation-order.md).

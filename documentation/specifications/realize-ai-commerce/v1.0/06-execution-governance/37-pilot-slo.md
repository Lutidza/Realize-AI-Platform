# 37. Pilot SLO

- **Статус:** target pilot defaults

На первых 5–10 installations измеряются:

- public site monthly availability не ниже 99.9%;
- Payload/AI control API availability не ниже 99.5%, исключая согласованные
  maintenance windows;
- 95% queued runs начинают обработку не позднее 60 секунд при штатной ёмкости;
- 100% mutations имеют actor, exact plan/config hash и audit trail;
- 0 unapproved R2/R3 mutations и 0 cross-installation access incidents;
- 95% preview environments достигают readiness либо завершаются явным
  диагностируемым failure;
- application rollback до known-good digest — не более 15 минут;
- backup restore drill — не реже одного раза в месяц и RTO не более 4 часов;
- secret leakage в DTO/log/evidence — 0;
- usage ledger reconciliation error — менее 0.1%.

SLO считается по telemetry, а не ручным заявлением. Нарушение security
инварианта блокирует расширение pilot независимо от средних показателей.

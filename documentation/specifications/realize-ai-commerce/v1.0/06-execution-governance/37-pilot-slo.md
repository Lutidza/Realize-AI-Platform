# 37. Рекомендуемые исходные SLO для пилота

Это рабочие цели, а не публичные гарантии:

- доступность storefront: 99.9% monthly target;
- license outage не влияет на storefront;
- first visible AI event: до 5 секунд при отсутствии очереди;
- read-only answer: типично до 60 секунд;
- data change dry-run: типично до 2 минут;
- code preview: типично до 20 минут;
- production deployment: типично до 10 минут после approval;
- RPO: до 15 минут при включённом PITR;
- RTO: до 60 минут для стандартного восстановления;
- audit event loss: 0 для committed changes;
- cross-installation access incidents: 0.

Перед коммерческим SLA показатели должны быть подтверждены нагрузочными и disaster recovery тестами.

---


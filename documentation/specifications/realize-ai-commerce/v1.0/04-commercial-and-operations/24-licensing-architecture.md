# 24. Licensing architecture

- **Статус:** target specification

## 24.1. Назначение

License Service выдаёт signed entitlement projection для installation:
доступные profiles/modules/capability classes, AI limits, release channel,
support tier и срок lease.

License является feature/usage ceiling. Она не заменяет authentication,
authorization, protected scopes, risk policy или approval. Наличие entitlement
не может разрешить запрещённую security operation.

## 24.2. Lease

Site runtime проверяет signature, installation ID, audience, issue/expiry,
policy version и anti-rollback sequence. Кэшированный lease позволяет
ограниченную работу при временной недоступности central service.

После expiry:

- публичный сайт и доступ владельца к его данным продолжают работать;
- read-only CMS сохраняется по локальной policy;
- новые платные AI mutations и production transitions блокируются;
- operator получает явный degraded state;
- уже начатый side effect завершается или восстанавливается по durable state,
  а не обрывается посередине.

## 24.3. Защита

Клиентская Admin не редактирует license, public key trust store или system
policy. Lease не содержит secrets и не доверяет installation ID из browser
payload. Revocation и clock-skew policy версионируются и аудитируются.

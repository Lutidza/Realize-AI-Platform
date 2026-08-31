# 28. Observability

- **Статус:** target specification

## 28.1. Correlation

Installation request, run, Change Request, execution job, preview, release и
deployment связываются correlation IDs. Логи, metrics, traces и audit events
используют одинаковые стабильные identifiers без секретов и полного content.

## 28.2. Сигналы

Обязательны:

- latency/error/rate для API и SSE;
- queue depth, claim age, retries и stuck jobs;
- tool/check/model usage и cost;
- approval wait time и stale conflicts;
- preview/build/deploy duration и health;
- policy denials, injection attempts и redaction events;
- license/usage degraded states;
- backup/restore и rollback results.

## 28.3. Audit и telemetry

Audit отвечает «кто, что, на основании какого exact artifact сделал».
Operational telemetry отвечает «работает ли система». Audit append-only и
имеет отдельную retention/доступ; observability backend не должен становиться
скрытым хранилищем prompts, PII или credentials.

Alerts маршрутизируются владельцу installation или operator-у по severity и
SLO, а не только пишутся в лог.

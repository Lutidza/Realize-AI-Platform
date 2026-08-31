# 25. Subscriptions и AI billing

- **Статус:** target specification

## 25.1. Коммерческая модель

Клиент покупает Realize subscription, AI credits/operations, profiles,
modules, support и release SLA. OpenAI account или credential клиенту не
перепродаётся.

## 25.2. Usage ledger

Каждый run создаёт idempotent usage records с installation, actor, provider,
model, input/output/cached units, tool/execution time, storage/preview cost,
pricing version и correlation IDs. Provider raw usage сохраняется отдельно от
коммерческой нормализации.

Перед дорогой операцией policy может резервировать budget. Финальный record
reconcile-ит reservation с фактом. Retry с тем же idempotency key не списывает
usage повторно.

## 25.3. Limits

Поддерживаются included quota, hard/soft budget, metered overage и operator
override. Limit проверяется до run и перед новым дорогим stage. Уже выполненный
side effect не объявляется отменённым только из-за позднего billing failure.

## 25.4. Приватность

Billing не хранит prompt, site content, secrets или полный diff. Клиент видит
понятные агрегаты и операции, оператор — cost evidence в пределах роли.
Изменение pricing не пересчитывает исторический ledger без отдельной
корректирующей записи.

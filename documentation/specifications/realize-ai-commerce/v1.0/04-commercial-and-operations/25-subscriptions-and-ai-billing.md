# 25. Подписки и AI-биллинг

## 25.1. Рекомендуемая коммерческая схема

```text
Monthly subscription
+ Included AI credits
+ Metered overage
+ Premium modules
+ Agency services
```

## 25.2. Почему не нужно продавать «OpenAI токены» напрямую

Клиент использует Customer Application агентства. Он не получает OpenAI account/key.

В интерфейсе можно показывать:

- AI credits;
- фактическое usage;
- ориентировочную стоимость операции;
- лимит;
- overage.

Внутренне сохраняются точные токены и provider cost.

## 25.3. Pricing version

Каждая ledger запись привязана к `pricing_version`.

Это необходимо, потому что:

- цены моделей меняются;
- markup меняется;
- included credits меняются;
- валютный курс может меняться;
- старые invoices должны воспроизводиться.

## 25.4. Расчёт

```text
provider_cost
+ execution_infrastructure_cost
+ platform_margin
+ optional support surcharge
= billable_amount
```

Можно использовать:

- процентную наценку;
- минимальную стоимость run;
- фиксированные credit coefficients;
- разные коэффициенты для read/data/code/deploy.

## 25.5. Reservations

Перед run:

- оценить максимум;
- зарезервировать credits;
- после завершения списать actual;
- освободить остаток;
- при failure применять policy: charge provider cost либо частичный credit refund.

## 25.6. Plan limits

- monthly included credits;
- hard monthly cap;
- per-run cap;
- concurrent runs;
- code changes per month;
- preview retention;
- deployment history;
- premium modules;
- support priority.

## 25.7. Разделение платёжных контуров

Текущий Stripe в ecommerce plugin обслуживает покупателей конкретного магазина.

Подписка Realize Platform — отдельный vendor billing contour:

- отдельные products/prices;
- отдельные webhooks;
- отдельный ledger;
- отдельные permissions;
- не хранится и не обрабатывается AI-моделью.

---


# 12. Risk и approvals

- **Статус:** target specification

## 12.1. Вычисление риска

Risk Engine учитывает одновременно:

- количество и тип затронутых ресурсов;
- чувствительность данных и наличие read-denied/write-denied scopes;
- обратимость и качество before-snapshot;
- schema/code/security влияние;
- внешние side effects;
- production blast radius;
- профильные правила и actor authority.

Модель может предложить risk, но итоговый уровень вычисляет сервер.

## 12.2. Уровни

- **R0:** чтение и объяснение без side effect.
- **R1:** малое обратимое изменение контента/config; policy может разрешить
  выполнение без предварительного human approval, но с audit.
- **R2:** обычная data/code mutation; обязательны plan approval и acceptance
  результата.
- **R3:** массовые данные, schema/migration, integration credential boundary,
  release или production; нужны раздельные approvals и усиленные checks.
- **R4:** запрещённая или operator-only операция. Клиентский run не исполняется.

License и роль могут только понизить доступный ceiling. Они не переводят
запрещённую security policy операцию в разрешённую.

## 12.3. Типы решений

- `PLAN_APPROVAL` — разрешает exact plan.
- `IMPLEMENTATION_ACCEPTANCE` — принимает exact diff/data artifact.
- `PREVIEW_ACCEPTANCE` — принимает exact preview evidence.
- `RELEASE_APPROVAL` — принимает immutable release candidate.
- `PRODUCTION_AUTHORIZATION` — отдельно разрешает rollout exact digest.
- `ROLLBACK_APPROVAL` — разрешает exact compensating action или restore plan.

Каждое решение связано с actor, role, timestamp, expiry, aggregate version и
artifact hash. Изменение scope, config release, input state или artifact
инвалидирует прежнее решение.

## 12.4. Separation of duties

Для R3 policy может требовать другого approver или operator escalation.
`RELEASE_APPROVAL` не выдаёт production credentials и не заменяет
`PRODUCTION_AUTHORIZATION`. Одно подтверждение нельзя неявно распространить на
будущие шаги.

# CHECK-PERFORMANCE-EVIDENCE

```yaml
artifact_id: CHECK-PERFORMANCE-EVIDENCE
artifact_type: ai-self-review-check
owner_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
owner_layer: .ai/checks/self-review/
rule: .ai/rules/development/RULE-PERFORMANCE-MEASUREMENT.md
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
registry: .ai/registry/rules/development/INDEX.md
check_stage: self_review_performance_evidence
scope: performance_change_claim
status: active
```

Применяй, когда результат заявляет оптимизацию или закрывает performance
регрессию. Если правило было отмечено not_required, эта проверка также
not_required.

- Baseline и результат относятся к одной операции, команде, единицам,
  существенным настройкам, workload и сопоставимым runtime/environment.
- Отдельно названы revision/build до и после, cold/warm/cache режим и размер
  выборки; значения p50/p95 не выдаются за надёжные при недостаточном числе
  запусков.
- Показано полное время операции и, если использовались внутренние интервалы,
  явно различены inclusive/exclusive spans, чтобы не считать вложенную работу
  дважды.
- Вывод опирается на распределение запусков, а не на лучший случай; разброс,
  ошибки, timeout, неполное покрытие и ограничения не скрыты.
- Корректность и значимые quality/resource budgets не ухудшились. Снижение
  timeout failure count не объявляется ускорением, если изменён только timeout.
- Добавленная telemetry не собирает запрещённое содержимое, имеет owner,
  границы доступа, overhead и retention; test benchmark не смешан с
  пользовательским operational потоком.
- Evidence сохранено по workflow и шаблону. Недостаточную выборку или
  невозможность честного сравнения укажи как ограничение, не заявляй доказанное
  улучшение.

В общем review укажи passed, failed или not_required, ссылку на evidence и
существенное ограничение.

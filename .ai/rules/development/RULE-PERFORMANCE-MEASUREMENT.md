# RULE-PERFORMANCE-MEASUREMENT

```yaml
artifact_id: RULE-PERFORMANCE-MEASUREMENT
artifact_type: project-development-rule
owner_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
owner_layer: .ai/rules/development/
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
check: .ai/checks/pre-implementation/CHECK-PERFORMANCE-MEASUREMENT-SCOPE.md
related_check: .ai/checks/self-review/CHECK-PERFORMANCE-EVIDENCE.md
related_workflow: .ai/workflows/quality/performance-measurement/WORKFLOW.md
registry: .ai/registry/rules/development/INDEX.md
architecture_source: documentation/architecture/platform-performance-measurement.md
rule_scope: project-wide
scope: performance_sensitive_work
status: active
```

## Когда применяется

Применяй это правило, если задача:

- прямо обещает оптимизацию latency, throughput, CPU/memory или стоимости
  критичного пути;
- расследует performance-инцидент, регрессию или задаёт performance budget;
- меняет горячий путь, запросы к базе, очередь, крупный I/O или повторное
  использование, когда стоимость является частью задачи или подтверждённого
  риска.

Для обычных изменений без ожидаемого влияния на производительность не требуй
benchmark, profiler или production telemetry. Если применимость неясна, кратко
обозначь риск и выбери измерение только когда оно влияет на инженерное решение.

## Обязательные действия

- До оптимизации запиши измеримую цель, операцию и baseline по
  [стандарту платформы](../../../documentation/architecture/platform-performance-measurement.md).
- Выбери end-to-end измерение; добавляй внутренние фазы только для объяснения
  наблюдаемой стоимости. Отмечай вложенные интервалы, количество вызовов и
  единицы, не приписывай всему общему таймеру смысл отдельной фазы.
- Удерживай сопоставимыми версии, runtime, окружение, объём входов, режим
  cache/cold/reuse и прогрев. До/после результаты снабжай размером выборки
  и ограничениями.
- Для заявления об улучшении сохрани evidence baseline и после изменения
  вместе с проверкой корректности, полноты и ошибок. Используй
  [workflow](../../workflows/quality/performance-measurement/WORKFLOW.md)
  и [шаблон](../../templates/performance/TEMPLATE-PERFORMANCE-MEASUREMENT.md).
- Отделяй локальный эксперимент от operational telemetry. Не включай
  production сбор или Admin панель в scope, если для них отдельно не определены
  контракт, owner, доступ, overhead и retention.
- Не собирай секреты, source text, локальные пути, SQL/request payload, prompts
  и лишние персональные данные. Не повышай общие timeouts для сокрытия задержки.

## Применимые проверки

До изменения пройди
[проверку области замера](../../checks/pre-implementation/CHECK-PERFORMANCE-MEASUREMENT-SCOPE.md).
При заявлении оптимизации пройди
[проверку evidence до/после](../../checks/self-review/CHECK-PERFORMANCE-EVIDENCE.md).
Для задач, где правило неприменимо, достаточно отметить это в рабочем плане;
общий performance запуск не требуется.

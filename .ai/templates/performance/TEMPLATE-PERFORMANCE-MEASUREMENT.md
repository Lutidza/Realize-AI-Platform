# План и отчёт измерения производительности

```yaml
template_id: TEMPLATE-PERFORMANCE-MEASUREMENT
template_type: performance-measurement-plan-and-report
owner_layer: .ai/templates/performance/
runtime_sources:
  - .ai/rules/development/RULE-PERFORMANCE-MEASUREMENT.md
  - documentation/architecture/platform-performance-measurement.md
```

## Решение и цель

- Applicability: required / not_required
- Причина и измеримая гипотеза:
- Целевая операция и владелец:
- Критерий успеха и обязательные correctness/quality checks:

## Сценарий и среда

- Revision/build до и после:
- Команда/точка запуска и конфигурация:
- Runtime, OS/CPU и существенные параметры среды:
- Workload, размер данных и источник fixture:
- Cache/cold/warm/reuse и прогрев:
- Число запусков и способ их повторения:

## Метрики

| Метрика и единица | Граница / inclusive или exclusive | До: sample count и распределение | После: sample count и распределение | Ограничения |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

- Outcome, ошибки, timeout и неполное покрытие:
- Counts/bytes, очередь, ожидание или cache/reuse, если применимы:
- Источник замера и его overhead:

## Итог

- Фактическое изменение показателей:
- Результат correctness/quality/resource checks:
- Известный разброс и ограничения сравнения:
- Связано ли это с operational telemetry или только с локальным benchmark:
- Нужны ли отдельный Admin view, storage или дальнейшее измерение:
- Evidence и следующий шаг:

Не записывай в отчёт секреты, содержимое исходников, локальные пути, SQL или
request payload, prompts и лишние персональные данные. Если сравнение
несопоставимо, обозначь это и не заявляй доказанное улучшение.

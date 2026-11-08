# Workflow измерения производительности

```yaml
artifact_id: ai-workflow-performance-measurement
artifact_type: ai-workflow
owner_layer: .ai/workflows/quality/performance-measurement/
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
rules:
  - .ai/rules/development/RULE-PERFORMANCE-MEASUREMENT.md
checks:
  pre_implementation:
    - .ai/checks/pre-implementation/CHECK-PERFORMANCE-MEASUREMENT-SCOPE.md
  self_review:
    - .ai/checks/self-review/CHECK-PERFORMANCE-EVIDENCE.md
template: .ai/templates/performance/TEMPLATE-PERFORMANCE-MEASUREMENT.md
architecture_source: documentation/architecture/platform-performance-measurement.md
related_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
```

## Когда запускать

Применяй при оптимизации, performance-инциденте/регрессии, создании budget
или изменении горячего пути, если замер повлияет на выбор решения.
Рутинная правка без такого риска пропускает workflow.

## Порядок

1. Пройди [check области измерения](../../../checks/pre-implementation/CHECK-PERFORMANCE-MEASUREMENT-SCOPE.md).
   Уточни операцию, владельца, гипотезу и критерий успеха до изменения.
2. Найди текущую инструментализацию компонента. Выбери метрику end-to-end;
   добавляй spans на внутренних границах только для объяснения наблюдаемой
   задержки. Не пиши отдельный stopwatch в каждом helper и не предполагай,
   что общий runtime API автоматически видит все функции.
3. Подготовь сопоставимые workload, данные, команды, runtime, конфигурацию,
   прогрев и cache/cold/reuse режим. Запиши baseline до оптимизации.
4. Повтори замер на нескольких запусках. Запиши sample count, медиану и
   применимые percentiles, outcome и разброс. Маленькую synthetic fixture
   не выдавай за реальный размер проекта или production нагрузку.
5. Меняй один подтверждённый bottleneck за эксперимент. После изменения
   повтори тот же сценарий и выполни проверки correctness/quality по исходному
   контракту. Увеличение timeout не заменяет оптимизацию.
6. Сохрани план, baseline, результаты, версии среды и ограничения по
   [шаблону отчёта](../../../templates/performance/TEMPLATE-PERFORMANCE-MEASUREMENT.md).
7. Различи controlled benchmark и operational telemetry. Для разового
   эксперимента оставь evidence у задачи. Запрос на сбор production events,
   общее хранилище или Admin dashboard оформи отдельным scope с владельцами,
   доступом, overhead, retention и privacy.
8. Пройди [self-review evidence](../../../checks/self-review/CHECK-PERFORMANCE-EVIDENCE.md)
   и передай вывод вместе с ограничениями.

## Достаточные выходы

- not_required с краткой причиной для неприменимого измерения;
- план до запуска baseline;
- воспроизводимый before/after отчёт с environment и sample size;
- либо ограничение, объясняющее, почему доказанного сравнения пока нет.

Workflow не назначает общие performance budgets и не запускает suite,
profiler, collector или Admin analytics без относящегося к сценарию основания.

# CHECK-PERFORMANCE-MEASUREMENT-SCOPE

```yaml
artifact_id: CHECK-PERFORMANCE-MEASUREMENT-SCOPE
artifact_type: ai-pre-implementation-check
owner_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
owner_layer: .ai/checks/pre-implementation/
rule: .ai/rules/development/RULE-PERFORMANCE-MEASUREMENT.md
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
registry: .ai/registry/rules/development/INDEX.md
check_stage: pre_implementation_performance_measurement_gate
scope: performance_sensitive_work
status: active
```

Выполняй вместе с правилом
[измерения производительности](../../rules/development/RULE-PERFORMANCE-MEASUREMENT.md).

Если задача явно не касается производительности, отметь not_required и
продолжай без отдельного benchmark.

Для измерительной задачи или оптимизации определи:

- целевую операцию и владельца фактической работы;
- измеримую гипотезу и желаемое изменение показателя;
- end-to-end duration и только необходимые внутренние фазы;
- исходники/версию, runtime, окружение, workload, размер данных, cache/cold/warm
  и прогрев;
- способ измерения, единицы, sample count и план сравнения;
- проверки корректности и неухудшения quality/error/resource budget;
- место хранения evidence и есть ли основание собирать operational telemetry
  или показывать данные в Admin.

Если это невозможно определить, сузь сценарий или обозначь недостающее
основание. Не начинай оптимизацию с предположения о самой дорогой функции,
и не запускай полный suite только ради получения одного latency числа.

Краткий output:

- performance_measurement: required|not_required
- target_operation:
- owner:
- hypothesis:
- baseline_and_scenarios:
- environment_and_workload:
- metrics_and_sample_count:
- correctness_checks:
- evidence_destination:
- operational_telemetry_or_admin:
- limitations:

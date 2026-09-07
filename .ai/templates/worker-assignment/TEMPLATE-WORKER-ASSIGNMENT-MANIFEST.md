# Шаблон: Worker Assignment Manifest (`TEMPLATE-WORKER-ASSIGNMENT-MANIFEST`)

```yaml
template_id: TEMPLATE-WORKER-ASSIGNMENT-MANIFEST
template_type: ai-runtime-manifest-template
owner_layer: .ai/templates/worker-assignment/
runtime_owner: .ai/workflows/core/worker-assignment/WORKFLOW.md
runtime_sources:
  - .ai/checks/worker-runtime/CHECK-WORKER-ASSIGNMENT-SCOPE.md
  - .ai/rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
```

Используй как краткий assignment message; отдельный файл необязателен.

```yaml
mission: <bounded task>
source_of_truth: [<relevant paths>]
owner_layer: <owner>
allowed_paths: [<paths>]
write_allowed: true
forbidden_paths: [<task-specific exclusions>]
checks: [<only relevant checks>]
expected_output: <result, changed paths, checks, blockers>
stop_condition: <when to return a blocker>
returns_to: <assigning agent>
```

Не копируй placeholders, пустые поля и полный transcript. Модель обычно
наследуется. Model override, profile и group fields добавляй лишь при их
реальном использовании. Для managed external runtime дополни assignment
обязательными полями writer/schema по worker-session workflow; этот компактный
шаблон не заменяет machine-readable schema выбранного tool.

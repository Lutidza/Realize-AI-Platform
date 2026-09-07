# CHECK-WORKING-ARTIFACT-LANGUAGE

```yaml
artifact_id: CHECK-WORKING-ARTIFACT-LANGUAGE
artifact_type: ai-self-review-check
owner_layer: .ai/checks/self-review/
rule: .ai/rules/global/RULE-WORKING-ARTIFACT-LANGUAGE.md
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
registry: .ai/registry/rules/INDEX.md
check_stage: self_review_artifact_language_gate
rule_scope: project-wide
scope: working_artifacts_and_handoffs
```

## Проверка при общем review

- Новый поясняющий текст понятен читателю и соответствует выбранному языку;
  русский используется по умолчанию для проектных инструкций и отчётов.
- Идентификаторы, команды, paths, protocol values и цитаты сохранены точно.
- Нет массового перевода вне задачи или новых комментариев ради language check.

Английские технические термины, существующие headings и package conventions
допустимы. Отдельный language report, список исключений и approval не нужны;
в общий review выноси только ошибки, влияющие на смысл.

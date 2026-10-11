# RULE-WORKING-ARTIFACT-LANGUAGE

```yaml
rule_id: RULE-WORKING-ARTIFACT-LANGUAGE
title: Русский язык рабочих artifacts
artifact_type: global-project-rule
owner_layer: .ai/rules/global/
rule_scope: project-wide
scope: working_artifacts_and_handoffs
applies_to:
  - .ai tasks
  - .ai reports
  - .ai audits
  - .ai roles
  - .ai rules
  - .ai checks
  - .ai workflows
  - .ai templates
  - .codex project skills
  - code comments
  - handoff artifacts
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
check: .ai/checks/self-review/CHECK-WORKING-ARTIFACT-LANGUAGE.md
registry: .ai/registry/rules/INDEX.md
related_templates:
  - .ai/templates/markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md
related_rules:
  - .ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md
```

## Требование

Новый поясняющий текст проектных инструкций, задач, отчётов, handoff и
комментариев по умолчанию пишется на русском. Текст должен быть понятен
читателю; язык ответа и конкретные требования пользователя учитываются отдельно.

Сохраняй точно identifiers, artifact ids, enum/status values, API/package names,
paths, команды, flags, hashes, protocol names и внешние цитаты. Английский
технический термин допустим, когда перевод ухудшает точность. Не переводи
машинный контракт ради формального language check.

Новые служебные заголовки делай понятными по-русски; существующие headings и
package conventions допустимы. Не начинай массовый перевод вне задачи и не
меняй стабильные anchors без проверки потребителей. Отдельные списки языковых
исключений, отчёты и согласования не нужны.

Проверь смысл при общем review по
[CHECK](../../checks/self-review/CHECK-WORKING-ARTIFACT-LANGUAGE.md).
Шаблоны помогают оформлению и не вводят более строгий языковой gate.

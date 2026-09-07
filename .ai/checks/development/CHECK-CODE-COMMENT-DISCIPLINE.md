# CHECK-CODE-COMMENT-DISCIPLINE

```yaml
artifact_id: CHECK-CODE-COMMENT-DISCIPLINE
artifact_type: ai-development-check
owner_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
owner_layer: .ai/checks/development/
rule: .ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md
related_rule: .ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md
related_check: .ai/checks/pre-implementation/CHECK-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md
templates:
  - .ai/templates/code-comments/TEMPLATE-TSDOC-FILE-HEADER.md
codex_skill: .codex/skills/code-comment-discipline/SKILL.md
check_stage: development_self_review
scope: changed_code_files
```

## Применимость

Проверять затронутые комментарии и неочевидные контракты при review source diff.
Отдельный запуск tools или отчёт для каждого изменённого файла не требуется.

## Условия прохождения

- Существенные ограничения или причины решения понятны из кода либо кратко
  объяснены; комментарии не пересказывают имена, типы и последовательность строк.
- Затронутые комментарии соответствуют текущему поведению.
- Добавленные ссылки и примеры актуальны, не содержат placeholders или secrets.
- Нет массового добавления headers, дат и tags ради оформления.

Отсутствие header, TSDoc у export или `@docref` не является ошибкой.
В общий review выноси только findings и непроверенные существенные контракты.

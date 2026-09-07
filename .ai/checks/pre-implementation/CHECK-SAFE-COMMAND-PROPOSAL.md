# CHECK-SAFE-COMMAND-PROPOSAL

```yaml
artifact_id: CHECK-SAFE-COMMAND-PROPOSAL
artifact_type: ai-pre-implementation-check
owner_layer: .ai/checks/pre-implementation/
rule: .ai/rules/global/RULE-SAFE-COMMAND-PROPOSAL.md
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
registry: .ai/registry/rules/INDEX.md
check_stage: pre_implementation_command_safety_gate
rule_scope: project-wide
scope: proposed_and_executed_commands
```

## Проверка

Перед нетривиальной командой проверь:

- cwd, target и побочные эффекты соответствуют задаче;
- destructive/external действие покрыто авторизацией;
- данные безопасно передаются аргументами и не исполняются как shell code;
- команда и диагностика не раскрывают secrets.

Это оценка перед выполнением, а не отдельный отчёт на каждый вызов tools.
Повторный approval для уже разрешённой работы не нужен. Неясный опасный target,
отсутствующая авторизация или утечка secret блокируют соответствующую команду;
обычные локальные записи и network reads сами по себе работу не блокируют.

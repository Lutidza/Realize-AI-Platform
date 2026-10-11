# RULE-SAFE-COMMAND-PROPOSAL

```yaml
rule_id: RULE-SAFE-COMMAND-PROPOSAL
title: Безопасное предложение и запуск команд
artifact_type: global-project-rule
owner_layer: .ai/rules/global/
rule_scope: project-wide
scope: proposed_and_executed_commands
applies_to:
  - shell commands
  - package manager commands
  - git commands
  - delivery commands
  - local tooling commands
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
check: .ai/checks/pre-implementation/CHECK-SAFE-COMMAND-PROPOSAL.md
registry: .ai/registry/rules/INDEX.md
related_rules:
  - .ai/rules/development/RULE-DEVELOPMENT-STRICT-PRINCIPLES.md
  - .ai/rules/git/RULE-GIT-DELIVERY.md
related_codex_artifacts:
  - .codex/skills/git-commit-push/SKILL.md
```

## Применение

Перед предложением или запуском shell/CLI/tool команды проверь её назначение,
рабочую директорию, target и побочные эффекты. Для обычного чтения достаточно
контекста текущего шага; отдельный отчёт на каждый вызов не нужен.

Для записи, внешнего или необратимого действия установи:

- что и где изменится, ожидаемый результат и способ проверки;
- класс действия: `read_only`, `local_write`, `network`, `delivery`,
  `destructive` или `secret_adjacent`;
- покрыто ли действие заданием и применимыми разрешениями;
- как исключены исполнение данных как кода и утечка секретов.

Эти сведения можно один раз сохранить в плане/TASK для группы одинаковых
действий. Новое назначение или изменившийся риск требуют повторной оценки.
Обычная обратимая запись и network read внутри задания не требуют отдельного
подтверждения. Для commit/push, deploy, удаления, production mutation и доступа
к защищённым данным действуют профильные правила и разрешения. Учитывай уже
выданные полномочия; не запрашивай их повторно.

## Ограничения

- Не помещай secrets, токены, private keys и secret-bearing URLs в команды,
  ответы, prompts, журналы и сообщения commit. Используй предусмотренный
  механизм безопасной передачи, а не shell interpolation.
- Передавай данные через структурированные аргументы или файлы, корректно
  экранируй shell. `JSON.stringify` не является shell quoting; строки с
  backticks и `$()` не должны исполняться как команды.
- Не называй запись, сетевую доставку или destructive action чтением.
- Если результат зависит от cwd, рабочая директория должна быть явной.
- Отсутствующее разрешение, неоднозначный опасный target или риск утечки
  останавливают соответствующую команду. Независимую работу продолжай.

Критерии — [CHECK](../../checks/pre-implementation/CHECK-SAFE-COMMAND-PROPOSAL.md).
В общий итог выноси только существенный результат, пропуск или препятствие.

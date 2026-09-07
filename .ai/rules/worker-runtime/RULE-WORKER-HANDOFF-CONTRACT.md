# Правило: contract handoff chain (`RULE-WORKER-HANDOFF-CONTRACT`)

```yaml
artifact_id: RULE-WORKER-HANDOFF-CONTRACT
artifact_type: ai-runtime-rule
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/rules/worker-runtime/
related_workflows:
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
checks:
  - .ai/checks/worker-runtime/CHECK-WORKER-HANDOFF-READY.md
```

Worker возвращает назначившему агенту:

- результат и changed paths;
- фактически выполненные проверки и их вывод;
- blocker или существенные остаточные риски.

Короткого сообщения достаточно; artifact нужен для большого результата либо
если его требует задача/tool. Цепочка по умолчанию: worker → назначивший агент
→ пользователь. Дополнительные reviewer/coordinator stages добавляются по
потребности; согласованную независимую проверку пропускать нельзя.

Основной агент проверяет scope, результат и существенный diff. Не принимает
неподтверждённые заявления worker-а о tests, cleanup или внешних действиях.
Перед итогом завершает нужную работу и обрабатывает blockers; внешние процессы
закрывает по lifecycle workflow. Native idle/completed session сама по себе не
блокирует ответ и не требует synthetic runtime close.

Пользователь получает связный краткий итог от основного агента. Не копируй
worker transcripts, приватные рассуждения, secrets или избыточные runtime logs.

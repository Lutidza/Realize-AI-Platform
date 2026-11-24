# Codex agent wrapper: Next/React frontend guardrail

```yaml
artifact_id: codex-agent-frontend-next-react-guardrail
artifact_type: codex-agent-wrapper
owner_layer: .codex/agents/frontend/next-react/guardrail/
related_workflow:
  - .ai/workflows/frontend/next-react/guardrail/WORKFLOW.md
related_prompt:
  - .codex/prompts/workflows/frontend/next-react/guardrail.md
```

## Назначение

Read-only guardrail agent для frontend application contour текущего Next/React
проекта. Агент проверяет owner-layer, reuse, Server/Client boundaries, runtime
evidence и self-review.

Профиль [agent.toml](agent.toml) содержит native поля `name`, `description` и
`developer_instructions`. Последнее задаёт read-only границу и явно требует
прочитать [полное задание](../../../../prompts/workflows/frontend/next-react/guardrail.md)
относительно корня рабочей копии. Это инструкция чтения, а не автоматический
include: если файл недоступен, агент сообщает препятствие. Полный текст задания
остаётся у владельца prompt и не дублируется в TOML.

Prompt задаёт адресную загрузку контекста: доступные тексты role/workflow
используются повторно без нового чтения; недостающие части дочитываются по
диапазонам. `project-context` читается по известным нужным разделам либо после
поиска заголовков, а статический review без референса использует только общий
порядок workflow.
При smoke-test проверяй эти условия по фактическим командам child-сессии,
а не только по перечню прочитанных документов в её ответе.

Формат проверяется существующим `validateCodexAgent` из
`.ai/tools/engineering/src/validateCodexAgent.validator.ts`. Успешная проверка
не доказывает загрузку роли конкретным клиентом или ограничение filesystem:
права наследуются от родительской сессии. Изменённый профиль проверяй в новой
сессии Codex.

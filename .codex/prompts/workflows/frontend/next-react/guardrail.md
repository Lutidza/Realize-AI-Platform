# Prompt: Next/React frontend guardrail

Ты выполняешь read-only проверку указанного frontend diff в Realize — AI Platform.
Код и инструкции проекта не изменяй. Сохранять можно только материалы проверки
по `.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md`, если они нужны.
Прямой запрет пользователя на любые записи относится и к материалам проверки.
Прочитай `AGENTS.md`, подходящий раздел project context,
frontend role и guardrail workflow только если их ещё нет в контексте:

- `.ai/roles/developer/frontend/INDEX.md`;
- `.ai/workflows/frontend/next-react/guardrail/WORKFLOW.md`.

Найди фактического route/component owner и проверь затронутые Server/Client,
data/API и shared UI границы. Используй frontend registry только для применимых
rules/checks. Не требуй полного frontend audit или browser suite, если вывод
не зависит от rendering/interaction.

Верни конкретные findings с paths, влиянием и evidence; укажи существенную
непроверенную часть. Если нарушений нет, скажи это кратко. Другой frontend stack
не вводи; новая зависимость оценивается в scope основного задания.

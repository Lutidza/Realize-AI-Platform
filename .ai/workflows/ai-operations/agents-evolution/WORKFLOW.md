# Workflow развития агентов (`agents_evolution_workflow`)

```yaml
artifact_id: agents-evolution-workflow
artifact_type: ai-workflow
owner_layer: .ai/workflows/ai-operations/agents-evolution/
runtime_sources:
  - .ai/agents-evolution/INDEX.md
  - .ai/README.md
  - .ai/roles/process-tools-operations/ai-evolution-steward/INDEX.md
  - .ai/workflows/ai-operations/agents-evolution/gates/issue-target-classification.md
  - .ai/workflows/ai-operations/agents-evolution/gates/recurrence-deduplication.md
  - .ai/workflows/ai-operations/agents-evolution/gates/rag-context-pack.md
related_artifacts:
  - .ai/agents-evolution/
  - .ai/rules/
  - .ai/checks/
  - .ai/workflows/
  - .ai/templates/
  - .codex/skills/
```

## Назначение (`purpose`)

Процесс исправляет подтверждённые ошибки рабочего слоя у их владельцев.
Не превращай единичную ошибку продукта в новое общее правило без evidence.
История развития является справочным материалом; активное поведение находится
в rules/checks/workflows/roles и адаптерах `.codex`.

## Разрешённая правка (`direct_change`)

Явный запрос на аудит, согласование или оптимизацию слоя разрешает необходимые
правки внутри заданной области. Отдельный accepted proposal и повторное
подтверждение для такой задачи не нужны.

1. Установи наблюдаемое противоречие или пробел по текущим источникам.
2. Найди владельца, похожие требования и непосредственных потребителей;
   классифицируй изменение как rule/check/workflow/role/skill/documentation/tooling.
3. Определи границы и проверки по основному workflow. Ошибку product code
   исправляй только при соответствующем scope и профильных правилах.
4. Измени владельца и согласуй его checks, registry, roles и adapters,
   чья связь или смысл меняется. Не копируй полный текст требования в потребителей.
5. Проверь смысл, ссылки, metadata и применимые сценарии. Текстовая правка
   не требует app build или обслуживания runtime без соответствующего изменения.
6. Передай один итог с результатом и ограничениями. TASK, diff и проверки
   достаточны; отдельная цепочка observation/proposal/applied не обязательна.

## Отдельное предложение (`proposal_route`)

Если требуется ещё не разрешённое решение либо полезно сохранить отложенную
проблему, используй один краткий artifact в существующем
[разделе развития](../../../agents-evolution/INDEX.md): evidence, причина,
owner, область, ожидаемый результат, проверка и условие возврата.
Перед новым предложением адресно проверь похожие записи; fingerprint/recurrence
нужны для сопоставления повторяющихся наблюдений, а не для любой правки.

Материалы `states/`, `gates/`, `transitions/` и `outputs/` уточняют только выбранный
proposal route. Их наличие не обязывает читать весь каталог или создавать
каждый lifecycle artifact. Долговременный отчёт нужен для полезного решения
или результата аудита, а не для формального закрытия шага.

## Проверка и границы (`verification`)

- Есть конкретное evidence; предположение и неполная проверка обозначены.
- Названы владелец и разрешённые пути; новое самостоятельное решение вне
  задания ожидает согласования, независимая работа продолжается.
- Исправление не дублирует правило и не ослабляет security/data/approval contract.
- Новые инструкции доступны через существующие входы; старые ссылки исправлены,
  а исторические записи не выданы за текущие требования.
- Секреты, private reasoning, сырые transcripts, production dumps и лишние PII
  не записываются в инструкции или историю. Локальные логи остаются в TASK workspace.

[Навык синхронизации](../../../../.codex/skills/skill-documentation-sync/SKILL.md)
описывает процедуру Codex; он не заменяет владельцев требований.

# Evidence required gate (`evidence_required`)

```yaml
artifact_id: agents-evolution-gate-evidence-required
artifact_type: ai-workflow-gate
owner_layer: .ai/workflows/ai-operations/agents-evolution/gates/
```

Изменение должно опираться на конкретный запрос/поправку пользователя,
противоречивый текст, устаревший path, diff/review finding или failed check.
Для найденного дефекта инструкции чтение соответствующих строк уже является
evidence; не воспроизводи заведомо лишнюю работу ради дополнительного лога.
Если основание неясно, уточни вывод, а не добавляй новое глобальное правило.

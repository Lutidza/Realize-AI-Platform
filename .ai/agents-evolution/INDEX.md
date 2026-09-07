# Индекс эволюции агентов (`agents-evolution-index`)

```yaml
artifact_id: agents-evolution-index
artifact_type: ai-evidence-directory-index
owner_layer: .ai/agents-evolution/
runtime_sources:
  - .ai/README.md
  - .ai/STRUCTURE.md
related_artifacts:
  - .ai/workflows/ai-operations/agents-evolution/
  - .ai/rules/
  - .ai/checks/
  - .codex/skills/
```

Директория хранит необязательные короткие evidence/proposals по развитию
AI-слоя. Active behavior находится в `.ai/rules/**`, `.ai/checks/**`,
`.ai/workflows/**` и `.codex/**`.

При явно запрошенной правке достаточно задачи, diff и проверки. Отдельные
observation/proposal/applied файлы не обязательны. Для устойчивой проблемы
или отложенного решения полезен один документ с evidence, owner, ожидаемым
изменением и проверкой; не дублируй его несколькими lifecycle artifacts.

Workflow: `.ai/workflows/ai-operations/agents-evolution/WORKFLOW.md`.
Существующие папки для долговременного trace:

- `observations/` — факты и причины;
- `improvement-proposals/` — предложения и scope;
- `applied-changes/` — результаты;
- `rejected/`, `deferred/`, `archive/` — прошлые решения.

Исторические записи — evidence прошлого, они не переопределяют текущие rules.
Новые файлы создавай лишь в scope задачи и ради полезного сохраняемого решения.
Храни references и краткие выводы; secrets, private reasoning, raw transcripts,
production dumps и лишние PII запрещены.

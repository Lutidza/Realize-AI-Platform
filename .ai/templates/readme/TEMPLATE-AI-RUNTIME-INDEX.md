# Шаблон: directory INDEX рабочего AI-слоя (`TEMPLATE-AI-RUNTIME-INDEX`)

```yaml
template_id: TEMPLATE-AI-RUNTIME-INDEX
template_type: ai-runtime-index-template
owner_layer: .ai/templates/readme/
applies_to:
  - .ai/*/INDEX.md
  - .ai/*/*/INDEX.md
runtime_sources:
  - .ai/templates/markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md
excludes:
  - .ai/README.md
  - README application contour
  - package README
  - пользовательская документация
  - продуктовая документация
```

## Необязательный каркас индекса

`INDEX.md` помогает понять назначение директории и выбрать нужный файл.
Достаточно короткого описания и списка ссылок с условиями чтения. Метаданные
сохраняй, если они используются registry или machine consumer.

```markdown
# Назначение директории

Что здесь находится и когда открывать этот индекс.

- Ссылка на файл — какую задачу он решает, когда читать.
```

Не копируй rules и порядок workflow в индекс. Если исполнение описано в
`WORKFLOW.md`, сошлись непосредственно на него. Новые папки, девять секций,
отдельный handoff report и пара technical id для каждого заголовка не нужны
ради соответствия шаблону.

Шаблон применим к AI-layer navigation. Структуру приложения описывает
`documentation/architecture/project-structure.md`, рабочий маршрутизатор —
`.ai/system/INDEX.md`. Для других документов используй их фактического владельца.
Общие советы оформления при необходимости доступны в
`.ai/templates/markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md`.

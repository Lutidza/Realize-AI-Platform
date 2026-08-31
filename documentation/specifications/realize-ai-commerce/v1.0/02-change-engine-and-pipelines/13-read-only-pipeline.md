# 13. Read-only pipeline

- **Статус:** target specification

## 13.1. Поток

```text
request
→ actor/installation resolution
→ read capability policy
→ source selection
→ protected-scope filtering
→ bounded retrieval
→ injection-aware context compilation
→ answer with evidence and audit
```

Policy применяется до retrieval. Ресурс с `read: deny` нельзя извлекать,
индексировать в агентскую knowledge base, пересказывать по метаданным или
раскрывать через ошибку.

## 13.2. Допустимые результаты

Pipeline может объяснять состояние, искать причины, сравнивать конфигурации,
строить план и оценивать влияние. Он не создаёт side effect и не выдаёт
credential, secret, hidden system prompt или данные другой инсталляции.

## 13.3. Недоверенный контент

Текст CMS, документы, code comments, uploads и web results считаются данными.
Инструкции внутри них маркируются как untrusted и не влияют на tool authority.
Citations/evidence должны позволять отличить источник от вывода модели.

## 13.4. Переход к mutation

Если ответ предлагает изменение, создаётся новый Change Request. Read-only run
не может сам повысить свой режим и использовать уже выданный context как
разрешение на запись.

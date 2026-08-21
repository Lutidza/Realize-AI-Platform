# Phase 1. Plugin skeleton и read-only browser chat

## 1.1. Создать npm workspace packages

- `ai-contracts`;
- `change-engine`;
- `payload-ai-plugin`;
- `codex-adapter`.

## 1.2. Реализовать plugin transformer

- options validation;
- config merge;
- custom view;
- minimal collections;
- access callbacks;
- disabled state;
- health/license placeholder.

## 1.3. Реализовать chat UI

- conversations;
- messages;
- SSE;
- run status;
- cancel;
- no writes.

## 1.4. Central worker prototype

- durable job;
- isolated checkout;
- Codex adapter;
- read-only sandbox;
- streaming events;
- usage capture.

## 1.5. Context Pack v1

- AGENTS;
- current docs;
- selected role/workflow/checks;
- repository map;
- active payload schema;
- hashes.

## Phase 1 acceptance

- plugin включается/отключается;
- `/admin/ai` работает;
- пользователь задаёт вопрос;
- Codex читает только текущий проект;
- события стримятся;
- usage сохраняется;
- нет write tools;
- нет OpenAI key в site app.

---


# 11. Change Engine

- **Статус:** target specification

## 11.1. Назначение

Change Engine — единственный owner управляемого изменения. Он преобразует
намерение в versioned plan, разрешает state transitions, связывает approvals с
exact hashes и передаёт работу только server-owned executors.

## 11.2. CapabilityDescriptor

Каждая возможность регистрируется сервером и содержит:

- стабильные `id` и `version`;
- класс: content, data, schema, design, frontend, code, module, plugin,
  configuration или release;
- применимый project profile;
- разрешённые actions и versioned input schema reference;
- стабильные server-side selector/resolver и executor references;
- read/write scope и protected-resource policy;
- risk signals, limits, required checks и approvals;
- preview, idempotency и rollback support.

Installation overlay может выбрать разрешённый descriptor или дополнительно
сузить его, но не создать новый executable или расширить scope.

Registry отклоняет malformed descriptor и повтор exact пары `id@version`.
Change Request и run всегда ссылаются на точную версию; неявный выбор
«последней» версии во время исполнения запрещён. Строковые references на
schema/resolver/executor/check являются идентификаторами server-owned
реализаций, а не командами для shell или кодом из installation config.

## 11.3. ChangeRequest

Нормативный Change Request фиксирует:

- actor и installation identity;
- system release и `AIConfigSnapshot` hash;
- исходное intent и выбранные capability versions;
- normalized operations и exact scope;
- risk assessment и estimated usage/cost;
- checks, preview и rollback strategy;
- input/current-state hashes и optimistic-lock values;
- approvals, artifacts, events и audit references.

## 11.4. State machine

```text
draft → planned → awaiting_approval → approved
→ executing → evidence_ready → awaiting_acceptance
→ accepted → release_ready → production_authorized → completed
```

Допустимы отдельные `rejected`, `cancelled`, `failed`, `blocked`,
`superseded` и `rolled_back`. Переходы выполняются командами с expected version;
повтор не должен создавать второй side effect.

## 11.5. Инварианты

Модель не вызывает executor напрямую. Raw SQL, unrestricted Payload CRUD,
произвольный shell и credentials не являются capabilities. Отсутствующий
descriptor означает отказ или operator escalation, а не импровизированный
обход.

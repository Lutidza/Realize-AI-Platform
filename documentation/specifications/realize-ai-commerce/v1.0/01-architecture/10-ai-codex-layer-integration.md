# 10. Интеграция системного и installation AI-layer

- **Статус:** target specification

## 10.1. Разделение владельцев

Системный слой поставляется платформой и включает security/license policy,
`.ai/**`, `.codex/**` adapters, capability/check registries, system prompts и
runtime compiler. Он не доступен для изменения из обычной клиентской Admin.

Installation overlay хранится в Payload как versioned product data: skills,
knowledge, prompt templates, local rules, roles, check bindings, agent profiles
workflows и evals. Он только сужает или дополняет поведение внутри системных
разрешений.

## 10.2. Компиляция Context Pack

Для каждого run compiler фиксирует:

- system release/version;
- installation config release и hash;
- actor, installation и license projection;
- разрешённые capabilities и protected scopes;
- выбранные instructions и bounded knowledge excerpts;
- check/policy versions;
- request и correlation IDs.

Context Pack ограничен по размеру, redacted и immutable для конкретного run.
Secrets, скрытые ресурсы, binary/runtime state и данные других инсталляций в
него не попадают.

## 10.3. Приоритет и недоверенный контент

```text
security + license ceilings
> system runtime instructions
> active installation release
> actor request
> retrieved/site/external content
```

Prompt, skill, knowledge document, code comment, upload или web page не может
выдать tool authority, изменить identity или отключить gate. Tool calls
валидируются по server-side capability descriptor независимо от текста модели.

## 10.4. Изменение overlay

Draft проходит schema validation, policy lint, injection checks и eval suite.
Activation создаёт immutable release. Rollback переключает active pointer на
ранее проверенный release. Runs сохраняют исходный hash и не пересобираются
задним числом.

## 10.5. Декларативный workflow

`WorkflowDefinition` является versioned installation artifact и содержит
stable key, entry step, ограничение числа шагов и типизированный граф. Первая
версия поддерживает только шаги `agent_turn`, `request_input`, `capability`,
`check`, `branch` и `finish`.

Все ссылки workflow разрешаются внутри exact configuration release. Граф обязан
иметь существующий entry step, уникальные ключи, достижимые terminal steps и не
может содержать циклы. `Capability` step создаёт типизированное намерение для
Change Engine, а не вызывает executor напрямую. Installation workflow может
выбрать или дополнительно сузить доступную capability и добавить check, но не
может убрать системный gate, расширить scope или зарегистрировать executable.

## 10.6. Детерминированная компиляция

Configuration compiler канонизирует JSON с упорядоченными object keys и
стабильным порядком artifacts, проверяет ссылки и вычисляет SHA-256 каждого
artifact и всего manifest. Effective agent context собирается только из exact
system release, immutable installation release и выбранного agent profile.

Если system release, installation release, agent profile или model policy
изменились, существующий provider thread не переиспользуется как эквивалентный
runtime context. Новый run получает новый compiled-context hash.

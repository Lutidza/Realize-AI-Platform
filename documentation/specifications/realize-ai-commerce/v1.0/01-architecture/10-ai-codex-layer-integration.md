# 10. Интеграция системного и installation AI-layer

- **Статус:** target specification

## 10.1. Разделение владельцев

Системный слой поставляется платформой и включает security/license policy,
`.ai/**`, `.codex/**` adapters, capability/check registries, system prompts и
runtime compiler. Он не доступен для изменения из обычной клиентской Admin.

Installation overlay хранится в Payload как versioned product data: skills,
knowledge, prompt templates, local rules, roles, check bindings, agent profiles
и evals. Он только сужает или дополняет поведение внутри системных разрешений.

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

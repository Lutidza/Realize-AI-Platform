# ADR-0015: Protected system AI layer and installation overlay

## Status

accepted-as-target

## Context

Администратору необходимо настраивать skills, knowledge, prompts, rules, roles,
checks и agents для своей инсталляции. Одновременно системные ограничения,
лицензионные запреты и часть кода/данных должны оставаться недоступными агентам,
иногда даже для чтения. Прямое редактирование системного `.ai/.codex` слоя из
Payload Admin смешало бы доверенные инструкции продукта с недоверенной
installation configuration.

## Decision

- Системный AI-layer поставляется и обновляется вместе с продуктом, защищён от
  изменения через Admin и является верхним runtime contract.
- Payload Admin управляет отдельным versioned installation overlay.
- Приоритет исполнения: security/license policy → system layer → active
  installation release → actor request и retrieved content.
- Installation overlay не может выдавать capability, которого нет у actor,
  лицензии или server policy, и не может менять protected read/write scopes.
- Локальные checks выбираются только из server-owned registry; произвольные
  shell-команды через Admin запрещены.
- Draft configuration проходит validation/evals и публикуется immutable
  release. Каждый run и Change Request связывается с exact release hash.
- Knowledge, uploads, web content и инструкции из управляемых данных считаются
  недоверенными и не могут изменять tool authority.
- Rollback переключает active release, но не переписывает историю запусков.

## Consequences

- Для overlay требуется отдельная schema, API и UI, не являющиеся редактором
  `.ai/**` или `.codex/**`.
- Security и licensing являются ceilings, а не выдающими права механизмами.
- Полное управление проектом означает широкий набор governed capabilities, а
  не unrestricted SQL, shell или обход Change Engine.

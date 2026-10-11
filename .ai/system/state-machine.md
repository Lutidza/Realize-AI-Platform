# Система: машина состояний AI-доставки (`ai-delivery-state-machine`)

```yaml
artifact_id: ai-delivery-state-machine
artifact_type: ai-system-model
owner_layer: .ai/system/
runtime_sources:
  - .ai/templates/markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md
related_artifacts:
  - .ai/system/INDEX.md
  - .ai/workflows/core/main-delivery/WORKFLOW.md
```

## Назначение (`purpose`)

Файл задаёт только базовую карту состояний AI-доставки.

## Границы (`boundaries`)

- Детальный порядок исполнения в `.ai/workflows/core/main-delivery/WORKFLOW.md`.
- Active rules в active rules layer.
- Проверки gates в `.ai/checks/*`.
- Этот файл не хранит описания каждого state, запреты переходов или workflow
  contracts.

## Основная цепочка (`primary_chain`)

```text
intake
-> context_pack
-> scope_gate
-> implementation
-> self_review
-> tests
-> docs_sync
-> handoff
```

Это карта основного workflow, а не отдельный набор обязательных gates.
`dialog_only` и `read_only` пропускают неприменимые этапы; roles, workers,
ручная приёмка и доставка подключаются только по условиям основного workflow.
Разрешённая задача не требует повторного `human_approval`; commit/push
не являются обязательным завершением правки.

## Контрольные состояния (`control_states`)

```text
blocked
needs_more_context
scope_expanded
rollback_required
```

## Вход (`input`)

- рабочий шаг AI-доставки;
- workflow, который уточняет базовую цепочку.

## Выход (`output`)

- базовая последовательность states;
- контрольное состояние, если обычная цепочка прервана.

## Передача результата (`handoff`)

Если нужно изменить порядок исполнения, owner-файл:
`.ai/workflows/core/main-delivery/WORKFLOW.md`. Этот файл обновляется только как
короткая системная карта.

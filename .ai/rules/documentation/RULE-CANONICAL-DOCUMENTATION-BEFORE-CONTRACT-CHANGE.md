# RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE

```yaml
rule_id: RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE
title: Решение по canonical documentation перед contract-level изменениями
artifact_type: project-documentation-rule
owner_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
  - .ai/roles/process-tools-operations/documentation-steward/INDEX.md
owner_layer: .ai/rules/documentation/
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
check: .ai/checks/pre-implementation/CHECK-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md
codex_skill: .codex/skills/skill-documentation-sync/SKILL.md
registry: .ai/registry/rules/INDEX.md
rule_scope: project-wide
scope: contract_level_changes
applies_to:
  - application contracts
  - ai runtime contracts
  - documentation sync
  - code boundary documentation
```

## Условие применения

Перед изменением product/API/DTO/schema, validation, auth, route, integration,
shared UI/backend boundary, workflow, role, rule или check определи владельца
контракта и нужную синхронизацию. Локальная неконтрактная правка не требует
полного аудита спецификаций.

## Источник контракта

- Product/architecture contract принадлежит ближайшему документу
  `documentation/**`, проверенному по текущему коду. Target specification
  не является доказательством реализованной возможности.
- Поведение рабочего агента принадлежит применимому `.ai/rules`, `checks`,
  `workflows` или роли; `.codex` содержит адаптер. Эти активные документы сами
  являются canonical source своих требований. Отдельная long-form spec для
  каждой правки инструкции не нужна.
- `AGENTS.md` владеет входным протоколом, README/INDEX — навигацией своего
  раздела. Они не заменяют предметное правило, API contract или workflow.
- Task, audit, history и code comments являются контекстом/evidence,
  а не конкурирующим владельцем требований.

Выбирай ближайший источник по затронутой области. Сохраняй
`canonical_doc_decision`: `existing_doc_found`, `existing_doc_insufficient`,
`missing_doc` или `not_contract_level` в плане/TASK, если задача требует записи.
Для простой правки достаточно решения в ходе подготовки без отдельного отчёта.

## Синхронизация и разрешения

Если источник достаточен, выполняй задачу и согласуй изменённые требования
с прямыми потребителями. Если он отсутствует или неполон, сначала определи
владельца и содержание изменения. Когда documentation sync входит в задание,
дополни источник в его существующем разделе и продолжай без повторного approval.

Если необходимое решение выходит за разрешённую область или владелец неясен,
останови зависимое изменение и назови конкретную причину. Отложить обязательную
синхронизацию можно только по явному решению пользователя, с `docs_sync_debt`,
владельцем и следующим шагом. Не создавай пустую спецификацию ради gate.

Порядок синхронизации —
[skill-documentation-sync](../../../.codex/skills/skill-documentation-sync/SKILL.md),
критерии — [CHECK](../../checks/pre-implementation/CHECK-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md).

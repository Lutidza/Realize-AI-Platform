# CHECK-SEARCH-SCOPE-DISCIPLINE

```yaml
artifact_id: CHECK-SEARCH-SCOPE-DISCIPLINE
artifact_type: ai-pre-implementation-check
owner_layer: .ai/checks/pre-implementation/
rule: .ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
registry: .ai/registry/rules/development/INDEX.md
check_stage: pre_implementation_search_scope_gate
rule_scope: project-wide
scope: repository_search
status: active
```

Перед поиском по репозиторию проверь:

- Цель, ожидаемый тип источника, конкретные include paths и способ ограничения
  выдачи понятны; готовый профиль CLI либо эквивалентный прямой `rg` подходит задаче.
- Обычный поиск исключает зависимости, generated/runtime output, секреты,
  dumps, историю и quarantined/reference contour по связанному правилу.
- Для `domain`, `search-layer`, `reference`, `special` и дополнительных
  `--path` названа причина. Для двух последних профилей указаны явные пути.
- Пути существуют внутри репозитория: нет absolute path, traversal или
  symlink за пределы корня. Историческое evidence не объявляется текущим owner.
- Повторный широкий поиск сужен; совпадение не расширяет разрешённый scope.
- Direct/native поиск использует средства среды без synthetic runtime state.
  Если полезная подзадача делегирована, её findings доступны назначившему агенту.
  Session/edge/monitor evidence проверяется только при выбранном managed режиме.

Отдельный search-worker и отдельная runtime session не являются условиями
прохождения. При отсутствии поиска результат `not_required`; при нарушении
границ — конкретный blocker. Новое разрешение нужно только для действия,
которое не покрыто заданием и действующими инструкциями.

В общий результат достаточно включить существенные сведения:

```text
search_scope_discipline_check: passed|failed|not_required
search_goal:
search_mode:
include_paths:
exclusions:
reason_for_expanded_scope:
output_limit_or_refinement:
evidence: <paths and relevant line references>
blocker:
```

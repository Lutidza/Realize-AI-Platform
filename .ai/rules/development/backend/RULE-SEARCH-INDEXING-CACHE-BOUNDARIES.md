# Границы поиска, индексации и кэша

```yaml
rule_id: RULE-SEARCH-INDEXING-CACHE-BOUNDARIES
owner_role: .ai/roles/developer/backend/INDEX.md
checks:
  - .ai/checks/development/backend/CHECK-SEARCH-INDEXING-CACHE-BOUNDARIES.md
```

Применяется только когда задача меняет существующий поисковый provider, index,
Search Profile или cache. Сначала подтверди, какой механизм реализован в
затронутом контуре; наличие target specification не доказывает работающий
Elasticsearch, Redis или Search Profile и не требует их устанавливать.

Payload/PostgreSQL остаётся источником доменных данных; индекс/кэш производны.
Для изменённой projection проверь mapping, consumer shape, invalidation и
необходимость reindex. Следуй существующему provider contract. Не обходи access
rules и не выдавай private fields в search response. Проверяй только затронутую
интеграцию; health/reindex действия нужны, если от них зависит результат.

# DTO contracts без raw Payload leakage

```yaml
rule_id: RULE-DTO-CONTRACTS-NO-RAW-PAYLOAD
owner_role: .ai/roles/developer/backend/INDEX.md
checks:
  - .ai/checks/development/backend/CHECK-DTO-CONTRACTS-NO-RAW-PAYLOAD.md
related_codex_artifacts:
  - .codex/skills/dto-contracts-first/SKILL.md
```

Применяется при изменении публичного DTO, API response или mapper/serializer.
Ответ за trust boundary строится явным набором полей; raw Payload document,
object spread документа и `PaginatedDocs<T>` не являются публичным контрактом.
Generated Payload types допустимы внутри persistence/admin owner.

Сначала найди producer, consumer и существующий type/mapper. Общие AI-контракты
находятся в `packages/ai-contracts/src/**`; серверные мапперы plugin — рядом с
владельцем endpoints в `packages/payload-ai-plugin/src/endpoints/**`. Для других
доменов выбери существующий feature/package owner по фактической структуре,
не создавая универсальные папки contracts/mappers заранее.

DTO отражает нужды конкретного consumer (public/self/admin/list), включая
nullability, relationship depth, pagination и сериализацию. Проверь allowlist
полей и отсутствие secrets/PII/access-controlled data в публичном ответе.
Shared/security-facing контракт проверяй целевыми позитивными и негативными
сценариями. Изменение DTO не требует аудита всех существующих imports проекта.

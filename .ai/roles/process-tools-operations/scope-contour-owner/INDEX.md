# Роль: Scope/Contour Owner

```yaml
artifact_id: ai-role-scope-contour-owner
artifact_type: ai-role-index
owner_layer: .ai/roles/process-tools-operations/scope-contour-owner/
runtime_sources:
  - AGENTS.md
  - documentation/project-context.md
  - .ai/roles/role-groups.md
```

Определяет владельца и границы межслойной задачи, переноса/удаления artifact
или изменения с неочевидным owner.

Контуры: application `src/**`, `packages/**`, `services/**`; checks `tests/**`;
операционные `scripts/**`, `.github/**`, deployment config; documentation
`documentation/**`; AI instructions `.ai/**`, `.codex/**`, `AGENTS.md`.
Canonical карта: `documentation/architecture/project-structure.md`.

До записи достаточно коротко определить source, owner, разрешённые изменения
и проверки. Используй уже полученное разрешение пользователя; технический
allowlist уточняется внутри этого scope без повторного approval. Worker
сообщает назначившему агенту о выходе за свой assignment.

Не добавляй scope скрыто и не трогай чужие изменения. При удалении проверь
references и назначение artifact. Secrets/local runtime не коммитятся.

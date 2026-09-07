# Check: worker profile references

```yaml
check_id: CHECK-WORKER-PROFILE-REFERENCES
owner_layer: .ai/checks/worker-runtime/
related_artifacts:
  - .ai/worker-profiles/INDEX.md
```

Применяется только если выбран reusable profile. Отсутствие готового профиля
не блокирует bounded assignment.

Pass: указанные в профиле правила, checks и workflows существуют, относятся
к текущему owner-layer и не расширяют пользовательское разрешение.
Fail: обязательная ссылка отсутствует либо profile навязывает чужой стек/scope.
Достаточно указать конкретную устаревшую ссылку; полный report не нужен.

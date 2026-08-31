# 15. Code change pipeline

- **Статус:** target specification

## 15.1. Применимость

Code Lane используется для frontend, design implementation, schema/migrations,
новых страниц и компонентов, modules, plugins, integrations, tests,
documentation и проектной конфигурации, когда declarative lane недостаточен.

## 15.2. Поток

```text
approved exact plan
→ clean isolated worktree
→ bounded Context Pack and short-lived capability
→ Codex workspace-write execution
→ path/protected-scope verification
→ server-owned checks
→ bounded diff and independent review
→ implementation acceptance
→ clean replay/service commit
→ isolated preview
→ preview acceptance
→ optional draft PR and release lanes
```

## 15.3. Ограничения

- Основной checkout и protected system/core paths не изменяются worker-ом.
- Allowlist относится к resolved paths; symlink, submodule и path traversal
  проверяются до и после execution.
- Worker не получает production credentials, Docker socket или произвольный
  network egress.
- Checks задаёт server registry, а не model output или local prompt.
- Diff за пределами scope блокирует результат целиком.
- Новый dependency требует version/source/compatibility evidence.

## 15.4. Результат

Accepted artifact включает exact commit/diff hash, check results, review,
preview evidence и исходные plan/config hashes. Draft Pull Request остаётся
source-review lane и не даёт merge/release/production authority.

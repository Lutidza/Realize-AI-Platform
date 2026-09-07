# Next/React frontend boundaries

```yaml
rule_id: RULE-NEXT-REACT-FRONTEND-BOUNDARIES
owner_role: .ai/roles/developer/frontend/INDEX.md
applies_to:
  - src/app/**
  - src/components/**
  - src/utilities/**
  - src/app/(app)/api/**
trigger:
  - любая UI-facing правка в текущем приложении
requirement:
  - определить source owner до изменения route/page/component/style behavior
  - различить Server Component and Client Component boundary
  - сохранять Next.js App Router, React, Tailwind/shadcn/Radix conventions
forbidden:
  - создавать локальный UI stack поверх существующего design/system owner
  - смешивать server-only code в client component без явного adapter
  - менять API/search/data contract из UI роли без backend role
checks:
  - .ai/checks/development/frontend/CHECK-NEXT-REACT-FRONTEND-BOUNDARIES.md
```

## Контракт

Текущий frontend приложения построен на Next.js App Router и React.
Source-first порядок:

1. Route owner в `src/app/**`.
2. Page/layout/component owner в `src/components/**`.
3. URL/SRP owner в `src/utilities/**`.
4. Data/API owner в `src/app/(app)/api/**`, `packages/payload-ai-plugin/src/**` или
   `services/**`.
5. Browser evidence нужен только для rendered DOM, responsive, forms,
   interactions or visual parity.

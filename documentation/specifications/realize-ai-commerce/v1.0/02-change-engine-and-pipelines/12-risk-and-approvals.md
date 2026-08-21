# 12. Классификация риска и approvals

## 12.1. Risk levels

### R0 — read-only

- вопрос о структуре;
- поиск документа;
- диагностика;
- объяснение;
- preview существующего состояния.

Approval не требуется.

### R1 — low-risk reversible data/config

- изменение одного текста;
- замена изображения;
- создание draft;
- изменение безопасного theme token;
- добавление готового блока в draft.

В первой версии: явное подтверждение write. Позже разрешается policy-based auto-approval.

### R2 — bulk or visible configuration change

- массовый перенос товаров;
- изменение категории у набора товаров;
- изменение навигации;
- изменение главной страницы;
- изменение нескольких design tokens;
- публикация нескольких документов.

Требуется plan approval и post-preview acceptance.

### R3 — code/schema/release

- изменение React/TypeScript;
- новый block/plugin extension;
- изменение Payload schema;
- migration;
- dependency change;
- production deploy.

Требуется:

- plan approval;
- автоматические проверки;
- preview;
- acceptance;
- release approval.

### R4 — destructive/privileged

- bulk delete;
- auth/access control;
- users;
- orders/payments;
- checkout/payment adapter;
- secrets;
- license code;
- deployment infrastructure;
- core platform;
- destructive migration;
- domain/DNS;
- restore backup.

Требуется dual approval: site owner + agency operator/engineer. Часть операций остаётся unsupported для AI MVP.

## 12.2. Approval types

```text
WRITE_CONFIRMATION
PLAN_APPROVAL
BULK_DATA_APPROVAL
SCHEMA_APPROVAL
PREVIEW_ACCEPTANCE
RELEASE_APPROVAL
DESTRUCTIVE_APPROVAL
ROLLBACK_APPROVAL
BUDGET_OVERRIDE
SCOPE_EXPANSION_APPROVAL
```

## 12.3. Cryptographic binding approval

Approval должен быть привязан к:

- change request ID;
- plan hash;
- scope hash;
- operation/diff hash;
- artifact digest;
- target environment;
- actor;
- expiration;
- current version.

Если после approval изменился plan, diff, artifact или environment — approval становится invalid.

## 12.4. Матрица ролей

| Действие | Owner | Admin | Content Manager | Catalog Manager | Developer | Agency Operator | Viewer |
|---|---:|---:|---:|---:|---:|---:|---:|
| Задать вопрос | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Создать data plan | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Подтвердить content write | ✓ | ✓ | ✓ | при catalog | ✓ | ✓ | — |
| Подтвердить bulk change | ✓ | ✓ | по policy | по policy | ✓ | ✓ | — |
| Создать code plan | ✓ | ✓ | — | — | ✓ | ✓ | — |
| Выполнить code change | ✓ | по policy | — | — | ✓ | ✓ | — |
| Approve production | ✓ | по policy | — | — | по policy | ✓ | — |
| Rollback | ✓ | — | — | — | ✓ | ✓ | — |
| Управлять лицензией | ✓ | — | — | — | — | ✓ | — |
| Смотреть billing | ✓ | по policy | — | — | — | ✓ | — |

Фактические права реализуются отдельными capabilities, а не только названием роли.

---


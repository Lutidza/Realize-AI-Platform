# ADR-0014: Universal site core and project profiles

## Status

accepted-as-target

## Context

Исторический e-commerce baseline смешивал универсальные возможности CMS и
профильные сущности каталога, корзины и checkout. Это создавало ложную границу:
будто Realize может управлять только интернет-магазином, хотя Change Engine,
AI control plane, content model, frontend и delivery применимы к сайтам разных
типов.

## Decision

- Realize определяется как универсальная AI-управляемая CMS-платформа.
- Платформенное ядро владеет content/data/schema/code/design/configuration и
  release capabilities, audit, approvals, security и lifecycle.
- Тип сайта задаётся versioned project profile с модулями, capability adapters,
  checks, templates и health criteria.
- E-commerce остаётся первым промышленным профилем и может содержать catalog,
  pricing, checkout, payments, orders, search и commerce-specific checks.
- Профиль не может ослабить системную security policy, лицензионный ceiling,
  protected scopes или approval requirements.
- Legacy repository/spec names сохраняются до отдельной migration decision и
  не определяют продуктовую границу.

## Consequences

- Новые core contracts не должны зависеть от product/category/order сущностей.
- Профильные операции реализуются через adapters к общему Change Engine.
- Acceptance и delivery используют core gates плюс checks активного профиля.
- Переименование репозитория и каталогов не входит в это решение.

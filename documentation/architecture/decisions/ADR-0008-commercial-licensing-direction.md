# ADR-0008: Commercial licensing direction

## Status

accepted-as-target

## Context

Plugin должен поддерживать runtime disabled state, но billing/licensing platform ещё не реализована.

## Decision

Каноническая license/entitlement запись принадлежит central control plane. Site хранит только подписанную ограниченную lease/projection и публичный verification key. Private signing key и OpenAI credentials не попадают в package, site DB или browser.

В первом read-only slice используется явный server-side feature flag; это не имитация production licensing.

## Consequences

- отключение entitlement не удаляет schema/history;
- status endpoint различает disabled, unavailable и ready;
- pricing, billing provider и offline grace policy требуют отдельных ADR до commercial release.

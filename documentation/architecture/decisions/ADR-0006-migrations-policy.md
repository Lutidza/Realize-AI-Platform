# ADR-0006: Payload migrations policy

## Status

accepted

## Context

AI collections и будущие изменения Payload schema требуют повторяемого production process.

## Decision

- schema changes оформляются Payload migrations;
- generated migration создаётся официальным Payload CLI и проверяется в diff;
- production schema push запрещён;
- deployment запускает migration job до переключения web service;
- перед рискованной production migration обязателен verified backup/restore point;
- migration failure останавливает rollout; rollback данных следует явно описанному migration plan.

## Consequences

Локальный development schema push допустим только для disposable DB и требует
явного `PAYLOAD_DB_PUSH=true`. По умолчанию development также работает в
migration-only режиме, чтобы запуск приложения не создавал `dev/-1` в adopted
history. Наличие новой collection без migration не считается готовым production
delivery.

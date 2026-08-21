# ADR-0001: Active product contour

## Status

accepted

## Context

В репозитории одновременно присутствуют рабочий storefront/Payload-контур, experimental `RealizeCore` и route contour `_realize`. До создания новых shared owners нужно определить единственный canonical contour.

## Evidence

- `src/payload.config.ts` регистрирует коллекции и globals рабочего приложения;
- `src/plugins/index.ts` является фактическим plugin pipeline;
- `src/app/(app)/**` и `src/app/(payload)/**` участвуют в активной Next.js сборке;
- `src/RealizeCore/**` не подключён к текущему Payload config как владелец приложения;
- `src/app/_realize/**` не является владельцем текущего storefront.

## Options considered

### Option A — текущий `(app)` + Payload config

Сохранить рабочий import graph и добавлять новые возможности через существующие extension points.

### Option B — `RealizeCore`

Переключить приложение на experimental contour до доказанной готовности его import graph и contracts.

### Option C — третий параллельный продуктовый contour

Создать независимый application root и дублировать существующие owners.

## Decision

Canonical product contour — `src/app/(app)/**`, `src/app/(payload)/**`, `src/payload.config.ts`, `src/plugins/index.ts` и подключённые ими `src/collections/**`, `src/globals/**`, `src/components/**`.

Нейтральные контракты текущего AI slice принадлежат workspace package
`packages/ai-contracts/**`. `src/domain/contracts/**` остаётся возможным
application-local target только после появления фактического owner-а и не
считается существующим active contour.

## Consequences

- Payload AI подключается через существующий plugin pipeline;
- generated Payload admin routes/import map не редактируются вручную;
- документация не описывает `RealizeCore` как production owner;
- перенос полезного кода из experimental contour выполняется отдельными задачами.

## Migration/quarantine plan

`src/RealizeCore/**` и `src/app/_realize/**` остаются в логическом quarantine без автоматического удаления. Их файлы не изменяются текущим slice.

## Reversal conditions

Решение пересматривается только после отдельного import-graph/runtime audit и миграционного плана, доказывающих готовность другого contour без параллельных owners.

## Follow-up tasks

- синхронизировать карту структуры после создания новых фактических owners;
- отдельно решить судьбу experimental contour;
- не создавать новые общие abstractions без реального второго consumer-а.

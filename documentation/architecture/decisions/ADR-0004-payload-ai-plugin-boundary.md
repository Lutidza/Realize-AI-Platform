# ADR-0004: Payload AI plugin boundary

## Status

accepted-as-target

## Context

AI UI, collections и endpoints должны подключаться к существующим Payload-проектам без замены их конфигурации.

## Decision

AI-функциональность оформляется как Payload Config transformer `@realize/payload-ai-control`. Transformer валидирует options и добавляет custom root view `/admin/ai`, минимальные collections и `/api/realize-ai/**`, сохраняя существующие `admin`, collections, globals, endpoints и порядок plugins.

Runtime-disabled режим сохраняет schema/history и запрещает запуск новых runs. Compile-time omission означает отсутствие plugin в pipeline.

## Consequences

- доступ строится поверх Payload authentication и admin role;
- API отдаёт DTO, не raw Payload documents;
- import map создаётся только Payload generator-ом;
- generic CRUD и неявное изменение access чужих collections запрещены.

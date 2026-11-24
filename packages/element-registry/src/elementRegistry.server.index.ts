/**
 * @file packages/element-registry/src/elementRegistry.server.index.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Экспортирует серверную компиляцию и lookup owners без filesystem, Payload или AI runtime.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
export { createOwnerRegistry } from "./createOwnerRegistry.service";
export { resolveElementOwner } from "./resolveElementOwner.service";

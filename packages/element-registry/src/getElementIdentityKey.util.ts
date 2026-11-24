/**
 * @file packages/element-registry/src/getElementIdentityKey.util.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Формирует однозначный внутренний ключ строгой пары namespace и local ID.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type { ElementIdentity } from "./OwnerRegistry.types";

/** JSON tuple сохраняет регистр и различает точки внутри разных частей identity. */
export function getElementIdentityKey(identity: ElementIdentity): string {
  return JSON.stringify([identity.namespace, identity.id]);
}

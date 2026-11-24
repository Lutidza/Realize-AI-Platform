/**
 * @file packages/element-registry/src/resolveElementOwner.service.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Разрешает exact owner reference внутри выбранного snapshot без fallback или execution grants.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type {
  OwnerRegistrySnapshot,
  ResolvedElementOwner,
} from "./OwnerRegistry.types";
import { elementOwnerRefSchema } from "./elementIdentity.schemas";
import { parseOwnerRegistryValue } from "./parseOwnerRegistryValue.validator";
import { getElementIdentityKey } from "./getElementIdentityKey.util";
import { freezeOwnerRegistryValue } from "./freezeOwnerRegistryValue.util";
import { OwnerRegistryError } from "./OwnerRegistry.error";

/** Snapshot создаёт createOwnerRegistry; serializable копия не заменяет проверенную host-композицию. */
export function resolveElementOwner(
  snapshot: OwnerRegistrySnapshot,
  value: unknown,
): ResolvedElementOwner {
  const reference = parseOwnerRegistryValue(elementOwnerRefSchema, value);
  const key = getElementIdentityKey(reference.identity);
  const registration = snapshot.registrations.find(
    (owner) => getElementIdentityKey(owner.identity) === key,
  );
  if (!registration) throw new OwnerRegistryError("UNKNOWN_OWNER", "/identity");
  return freezeOwnerRegistryValue({
    identity: structuredClone(registration.identity),
    kind: registration.kind,
    title: registration.title,
    rootProject: structuredClone(snapshot.rootProject),
    snapshotHash: snapshot.snapshotHash,
  });
}

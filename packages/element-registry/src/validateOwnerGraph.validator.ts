/**
 * @file packages/element-registry/src/validateOwnerGraph.validator.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Проверяет все ownership chains до явно переданного терминального project.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type {
  OwnerRegistration,
  ParsedOwnerRegistryInput,
} from "./OwnerRegistry.types";
import { getElementIdentityKey } from "./getElementIdentityKey.util";
import { OwnerRegistryError } from "./OwnerRegistry.error";

/** Неиспользуемый package проходит те же проверки неизвестного owner, self-reference и циклов. */
export function validateOwnerGraph(
  input: ParsedOwnerRegistryInput,
): readonly OwnerRegistration[] {
  const rootKey = getElementIdentityKey(input.rootProject.identity);
  const registrations = new Map<string, OwnerRegistration>([
    [rootKey, input.rootProject],
  ]);
  for (const [index, owner] of input.owners.entries()) {
    const key = getElementIdentityKey(owner.identity);
    if (registrations.has(key))
      throw new OwnerRegistryError(
        "DUPLICATE_IDENTITY",
        `/owners/${index}/identity`,
      );
    registrations.set(key, owner);
  }
  for (const [index, owner] of input.owners.entries()) {
    if (!registrations.has(getElementIdentityKey(owner.owner.identity)))
      throw new OwnerRegistryError(
        "UNKNOWN_OWNER",
        `/owners/${index}/owner/identity`,
      );
  }
  const resolved = new Set([rootKey]);
  for (const [index, owner] of input.owners.entries()) {
    const visiting = new Set<string>();
    let key = getElementIdentityKey(owner.identity);
    while (!resolved.has(key)) {
      if (visiting.has(key))
        throw new OwnerRegistryError(
          "OWNER_CYCLE",
          `/owners/${index}/owner/identity`,
        );
      visiting.add(key);
      const current = registrations.get(key);
      if (!current || current.kind !== "package")
        throw new OwnerRegistryError(
          "UNKNOWN_OWNER",
          `/owners/${index}/owner/identity`,
        );
      key = getElementIdentityKey(current.owner.identity);
    }
    for (const visited of visiting) resolved.add(visited);
  }
  return [...registrations.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, registration]) => registration);
}

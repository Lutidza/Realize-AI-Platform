/**
 * @file packages/element-registry/src/validateOwnerPackageBindings.validator.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Сверяет package bindings с явно переданными metadata и сохраняет проверенные public targets.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type {
  OwnerRegistration,
  ParsedOwnerRegistryInput,
  ResolvedOwnerPackageBinding,
} from "./OwnerRegistry.types";
import { getElementIdentityKey } from "./getElementIdentityKey.util";
import { OwnerRegistryError } from "./OwnerRegistry.error";

/** Проверка metadata не доказывает установку, подпись выпуска или actor permissions. */
export function validateOwnerPackageBindings(
  input: ParsedOwnerRegistryInput,
  registrations: readonly OwnerRegistration[],
): readonly ResolvedOwnerPackageBinding[] {
  const owners = new Map(
    registrations.map((owner) => [
      getElementIdentityKey(owner.identity),
      owner,
    ]),
  );
  const packages = new Map<
    string,
    ParsedOwnerRegistryInput["trustedPackages"][number]
  >();
  for (const [index, metadata] of input.trustedPackages.entries()) {
    if (packages.has(metadata.name))
      throw new OwnerRegistryError(
        "DUPLICATE_TRUSTED_PACKAGE",
        `/trustedPackages/${index}/name`,
      );
    packages.set(metadata.name, metadata);
  }
  const bound = new Set<string>();
  const bindings: ResolvedOwnerPackageBinding[] = [];
  for (const [index, binding] of input.packageBindings.entries()) {
    const key = getElementIdentityKey(binding.identity);
    if (bound.has(key))
      throw new OwnerRegistryError(
        "DUPLICATE_PACKAGE_BINDING",
        `/packageBindings/${index}/identity`,
      );
    bound.add(key);
    const owner = owners.get(key);
    if (!owner)
      throw new OwnerRegistryError(
        "UNKNOWN_PACKAGE_OWNER",
        `/packageBindings/${index}/identity`,
      );
    if (owner.kind !== "package")
      throw new OwnerRegistryError(
        "INVALID_PACKAGE_OWNER",
        `/packageBindings/${index}/identity`,
      );
    const metadata = packages.get(binding.packageName);
    if (!metadata)
      throw new OwnerRegistryError(
        "PACKAGE_NAME_MISMATCH",
        `/packageBindings/${index}/packageName`,
      );
    if (metadata.version !== binding.packageVersion)
      throw new OwnerRegistryError(
        "PACKAGE_VERSION_MISMATCH",
        `/packageBindings/${index}/packageVersion`,
      );
    const requiredExports = [...binding.requiredExports].sort();
    const exports: Record<string, string> = {};
    for (const entry of requiredExports) {
      if (!Object.hasOwn(metadata.exports, entry))
        throw new OwnerRegistryError(
          "PACKAGE_EXPORT_UNAVAILABLE",
          `/packageBindings/${index}/requiredExports`,
        );
      exports[entry] = metadata.exports[entry];
    }
    bindings.push({
      identity: binding.identity,
      packageName: binding.packageName,
      packageVersion: binding.packageVersion,
      requiredExports,
      exports,
    });
  }
  return bindings.sort((left, right) => {
    const leftKey = getElementIdentityKey(left.identity);
    const rightKey = getElementIdentityKey(right.identity);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

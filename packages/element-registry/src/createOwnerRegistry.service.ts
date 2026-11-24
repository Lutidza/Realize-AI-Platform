/**
 * @file packages/element-registry/src/createOwnerRegistry.service.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Компилирует доверенную композицию owners в detached frozen snapshot с детерминированным hash.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { createHash } from "node:crypto";
import type { OwnerRegistrySnapshot } from "./OwnerRegistry.types";
import { ownerRegistryInputSchema } from "./ownerRegistry.schemas";
import { parseOwnerRegistryValue } from "./parseOwnerRegistryValue.validator";
import { validateOwnerGraph } from "./validateOwnerGraph.validator";
import { validateOwnerPackageBindings } from "./validateOwnerPackageBindings.validator";
import { freezeOwnerRegistryValue } from "./freezeOwnerRegistryValue.util";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Host передаёт root anchor и metadata явно; функция не принимает доверие из полей manifest и не делает I/O. */
export function createOwnerRegistry(value: unknown): OwnerRegistrySnapshot {
  const input = parseOwnerRegistryValue(ownerRegistryInputSchema, value);
  const registrations = validateOwnerGraph(input);
  const packageBindings = validateOwnerPackageBindings(input, registrations);
  const snapshot = {
    schemaVersion: "1.0" as const,
    rootProject: input.rootProject.identity,
    registrations,
    packageBindings,
  };
  const snapshotHash = createHash("sha256")
    .update(canonicalJson(snapshot), "utf8")
    .digest("hex");
  return freezeOwnerRegistryValue({
    ...snapshot,
    snapshotHash,
  }) as OwnerRegistrySnapshot;
}

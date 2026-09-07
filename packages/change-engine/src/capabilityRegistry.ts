/**
 * @file packages/change-engine/src/capabilityRegistry.ts
 * @version 2026-09-01
 * @description Реализует immutable exact-version registry server-owned capabilities.
 * @docref Realize AI Commerce v1.0 — Change Engine
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/11-change-engine.md
 */

import type {
  CapabilityDescriptor,
  CapabilityReference,
} from "@realize/ai-contracts";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)+$/;
const VERSION = /^\d+\.\d+(?:\.\d+)?$/;
const APPROVAL_STAGES = new Set([
  "implementation_acceptance",
  "plan_approval",
  "preview_acceptance",
  "release_approval",
  "rollback_confirmation",
  "write_confirmation",
]);
const CAPABILITY_CLASSES = new Set([
  "code",
  "configuration",
  "content",
  "data",
  "design",
  "frontend",
  "module",
  "plugin",
  "release",
  "schema",
]);
const RISK_LEVELS = new Set(["R0", "R1", "R2", "R3", "R4"]);

/** Ошибка malformed, duplicate или отсутствующего capability descriptor. */
export class CapabilityRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityRegistryError";
  }
}

const exactKey = (reference: CapabilityReference): string =>
  `${reference.id}@${reference.version}`;

const requireUnique = (values: readonly string[], name: string): void => {
  if (new Set(values).size !== values.length) {
    throw new CapabilityRegistryError(`${name} must not contain duplicates.`);
  }
};

const requireReference = (
  reference: CapabilityReference,
  name: string,
): void => {
  if (
    !reference ||
    typeof reference.id !== "string" ||
    typeof reference.version !== "string" ||
    !IDENTIFIER.test(reference.id) ||
    !VERSION.test(reference.version)
  ) {
    throw new CapabilityRegistryError(`${name} is invalid.`);
  }
};

const validateDescriptor = (descriptor: CapabilityDescriptor): void => {
  if (
    !descriptor ||
    !Array.isArray(descriptor.actions) ||
    !Array.isArray(descriptor.approvals) ||
    !Array.isArray(descriptor.projectProfiles) ||
    !Array.isArray(descriptor.requiredCheckIDs) ||
    !Array.isArray(descriptor.riskSignals) ||
    !descriptor.limits ||
    !descriptor.scopes ||
    !Array.isArray(descriptor.scopes.read) ||
    !Array.isArray(descriptor.scopes.write) ||
    !descriptor.support
  ) {
    throw new CapabilityRegistryError("Capability descriptor is malformed.");
  }
  requireReference(descriptor, "Capability reference");
  requireReference(descriptor.inputSchema, "Input schema reference");
  requireReference(descriptor.resolver, "Resolver reference");
  requireReference(descriptor.executor, "Executor reference");

  if (
    typeof descriptor.title !== "string" ||
    typeof descriptor.description !== "string" ||
    !descriptor.title.trim() ||
    !descriptor.description.trim()
  ) {
    throw new CapabilityRegistryError(
      `Capability ${exactKey(descriptor)} requires title and description.`,
    );
  }
  if (
    descriptor.actions.length === 0 ||
    descriptor.projectProfiles.length === 0
  ) {
    throw new CapabilityRegistryError(
      `Capability ${exactKey(descriptor)} requires an action and project profile.`,
    );
  }
  if (
    !CAPABILITY_CLASSES.has(descriptor.capabilityClass) ||
    !RISK_LEVELS.has(descriptor.riskLevel) ||
    descriptor.approvals.some((stage) => !APPROVAL_STAGES.has(stage)) ||
    !["deny", "operator-only"].includes(descriptor.scopes.protectedResources) ||
    (["dryRun", "idempotency", "preview", "rollback"] as const).some(
      (key) => typeof descriptor.support[key] !== "boolean",
    )
  ) {
    throw new CapabilityRegistryError(
      `Capability ${exactKey(descriptor)} contains invalid policy values.`,
    );
  }
  if (
    !Number.isInteger(descriptor.limits.maxTargets) ||
    descriptor.limits.maxTargets < 1 ||
    !Number.isInteger(descriptor.limits.maxBatchSize) ||
    descriptor.limits.maxBatchSize < 1 ||
    descriptor.limits.maxBatchSize > descriptor.limits.maxTargets
  ) {
    throw new CapabilityRegistryError(
      `Capability ${exactKey(descriptor)} has invalid limits.`,
    );
  }

  const identifierLists: ReadonlyArray<readonly string[]> = [
    descriptor.actions,
    descriptor.projectProfiles,
    descriptor.requiredCheckIDs,
    descriptor.riskSignals,
    descriptor.scopes.read,
    descriptor.scopes.write,
  ];
  for (const values of identifierLists) {
    if (
      values.some(
        (value) => typeof value !== "string" || !IDENTIFIER.test(value),
      )
    ) {
      throw new CapabilityRegistryError(
        `Capability ${exactKey(descriptor)} contains an invalid identifier.`,
      );
    }
  }
  for (const [name, values] of [
    ["actions", descriptor.actions],
    ["approvals", descriptor.approvals],
    ["project profiles", descriptor.projectProfiles],
    ["required checks", descriptor.requiredCheckIDs],
    ["risk signals", descriptor.riskSignals],
    ["read scopes", descriptor.scopes.read],
    ["write scopes", descriptor.scopes.write],
  ] as const) {
    requireUnique(values, `${exactKey(descriptor)} ${name}`);
  }
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

/** Exact-version lookup без неявного выбора latest descriptor. */
export class CapabilityRegistry {
  private readonly descriptors: ReadonlyMap<string, CapabilityDescriptor>;

  constructor(input: readonly CapabilityDescriptor[]) {
    const descriptors = new Map<string, CapabilityDescriptor>();
    for (const source of input) {
      validateDescriptor(source);
      const descriptor = deepFreeze(
        structuredClone(source) as CapabilityDescriptor,
      );
      const key = exactKey(descriptor);
      if (descriptors.has(key)) {
        throw new CapabilityRegistryError(
          `Duplicate capability descriptor: ${key}.`,
        );
      }
      descriptors.set(key, descriptor);
    }
    this.descriptors = descriptors;
  }

  /** Возвращает exact descriptor или undefined без fallback на другую версию. */
  get(reference: CapabilityReference): CapabilityDescriptor | undefined {
    return this.descriptors.get(exactKey(reference));
  }

  /** Возвращает стабильную отсортированную проекцию registry. */
  list(): readonly CapabilityDescriptor[] {
    return [...this.descriptors.values()].sort((left, right) => {
      const leftKey = exactKey(left);
      const rightKey = exactKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  }

  /** Требует exact descriptor и сообщает bounded policy error при отсутствии. */
  require(reference: CapabilityReference): CapabilityDescriptor {
    const descriptor = this.get(reference);
    if (!descriptor) {
      throw new CapabilityRegistryError(
        `Capability descriptor is not registered: ${exactKey(reference)}.`,
      );
    }
    return descriptor;
  }
}

/** Создаёт immutable registry из server-owned descriptors. */
export const createCapabilityRegistry = (
  descriptors: readonly CapabilityDescriptor[],
): CapabilityRegistry => new CapabilityRegistry(descriptors);

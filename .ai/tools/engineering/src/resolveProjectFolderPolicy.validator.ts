/**
 * @file .ai/tools/engineering/src/resolveProjectFolderPolicy.validator.ts
 * @version 1.1.0
 * @date 2026-10-29
 * @description Проверяет trusted policies и пересекает ограничения всех физических предков пути.
 * @see documentation/architecture/engineering-artifacts.md
 */
import { engineeringPathSchema } from "@realize/engineering-runtime/contracts";
import {
  generatedHeaderDirectories,
  generatedHeaderExceptions,
} from "../../source-headers/src/sourceHeaders.config.ts";
import type {
  EffectiveFolderPolicy,
  ProjectFolderPolicy,
} from "./ProjectArtifactBinding.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { ARTIFACT_LIMITS } from "./projectArtifactProfiles.config.ts";

const contains = (root: string, path: string) =>
  path === root || path.startsWith(`${root}/`);
const clean = (value: string) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  !/[\0\r\n]/.test(value);

/** Hard exclusions сохраняются при любом root, owner или предложенном kind. */
export function assertArtifactPath(path: string): void {
  if (!engineeringPathSchema.safeParse(path).success)
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Недопустимый workspace path.",
    );
  if (
    /(?:^|\/)(?:\.git|node_modules|\.next|dist|build|\.ai-workspace|\.playwright-mcp|\.env(?:\.[^/]*)?|auth\.json|\.gitkeep)(?:\/|$)/.test(
      path,
    ) ||
    ["src/RealizeCore", "src/app/_realize", "src/app/(reference)"].some(
      (root) => contains(root, path),
    ) ||
    Object.hasOwn(generatedHeaderExceptions, path) ||
    generatedHeaderDirectories.some((root) =>
      contains(root.replace(/\/$/, ""), path),
    )
  )
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Путь принадлежит исключённому или generated контуру.",
    );
}

/** Root policies обязаны задавать allowed sets; omissions потомков наследуются. */
export function validateProjectFolderPolicies(
  input: readonly ProjectFolderPolicy[],
): ProjectFolderPolicy[] {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > ARTIFACT_LIMITS.policies
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Нужен ограниченный непустой список folder policies.",
    );
  const policies = structuredClone(input);
  const ids = new Set<string>();
  const roots = new Set<string>();
  const supportedFields = new Set([
    "id",
    "version",
    "root",
    "ownerRef",
    "purpose",
    "boundary",
    "inheritsFrom",
    "allowedKinds",
    "allowedProvenance",
    "excludedPaths",
    "requiredCheckRefs",
    "relationshipRules",
    "sourcePaths",
  ]);
  for (const policy of policies) {
    if (
      !policy ||
      Object.keys(policy).some((field) => !supportedFields.has(field))
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Folder policy содержит неподдержанные обязательства.",
      );
    assertArtifactPath(policy.root);
    if (
      ![policy.id, policy.version, policy.ownerRef, policy.purpose].every(
        clean,
      ) ||
      ids.has(policy.id) ||
      roots.has(policy.root) ||
      ![
        "owner",
        "feature",
        "client",
        "server",
        "contracts",
        "generated",
      ].includes(policy.boundary)
    )
      throw new ProjectArtifactError(
        "CONFLICT",
        "Folder policy отсутствует, дублируется или неоднозначна.",
      );
    ids.add(policy.id);
    roots.add(policy.root);
    for (const values of [
      policy.inheritsFrom,
      policy.allowedKinds,
      policy.allowedProvenance,
      policy.excludedPaths,
      policy.requiredCheckRefs,
      policy.relationshipRules,
      policy.sourcePaths,
    ]) {
      if (
        values !== undefined &&
        (!Array.isArray(values) ||
          values.length > 128 ||
          values.some((value) => !clean(value)))
      )
        throw new ProjectArtifactError(
          "INVALID_INPUT",
          "Недопустимое множество folder policy.",
        );
    }
    if (!policy.sourcePaths?.length)
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Folder policy требует versioned source evidence.",
      );
    if (
      policy.allowedProvenance?.some(
        (value: unknown) =>
          typeof value !== "string" ||
          !["authored", "generated", "mixed", "vendor"].includes(value),
      )
    )
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Неизвестное происхождение артефакта.",
      );
    for (const path of [
      ...policy.sourcePaths,
      ...(policy.excludedPaths ?? []),
    ]) {
      if (!engineeringPathSchema.safeParse(path).success)
        throw new ProjectArtifactError(
          "INVALID_INPUT",
          "Некорректный policy reference path.",
        );
    }
  }
  for (const policy of policies) {
    const parents = policies.filter(
      (parent) => parent !== policy && contains(parent.root, policy.root),
    );
    if (
      !parents.length &&
      (policy.allowedKinds === undefined ||
        policy.allowedProvenance === undefined)
    )
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Root policy обязана задавать allowedKinds и allowedProvenance.",
      );
    for (const parentId of policy.inheritsFrom ?? []) {
      const parent = policies.find((candidate) => candidate.id === parentId);
      if (!parent || parent === policy || !contains(parent.root, policy.root))
        throw new ProjectArtifactError(
          "CONFLICT",
          "Policy наследует неизвестную или соседнюю границу.",
        );
    }
    const nearest = parents.sort((a, b) => b.root.length - a.root.length)[0];
    if (
      nearest &&
      nearest.ownerRef !== policy.ownerRef &&
      policy.boundary !== "owner"
    )
      throw new ProjectArtifactError(
        "CONFLICT",
        "Смена owner требует явной owner boundary.",
      );
  }
  return [...policies];
}

/** Более глубокая policy не отменяет запреты, required checks и allowed sets предков. */
export function resolveProjectFolderPolicy(
  policies: readonly ProjectFolderPolicy[],
  path: string,
): EffectiveFolderPolicy {
  assertArtifactPath(path);
  const applicable = policies
    .filter((policy) => contains(policy.root, path))
    .sort((a, b) => a.root.length - b.root.length);
  if (!applicable.length)
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Для пути не зарегистрирован owner.",
    );
  let kinds = [...applicable[0].allowedKinds!];
  let provenance = [...applicable[0].allowedProvenance!];
  const checks = new Set<string>(["folder.placement"]);
  const sources = new Set<string>();
  let executionBoundary: EffectiveFolderPolicy["executionBoundary"] = null;
  for (const policy of applicable) {
    if (policy.boundary === "client" || policy.boundary === "server") {
      if (executionBoundary !== null && executionBoundary !== policy.boundary)
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Physical client/server policies противоречат друг другу.",
        );
      executionBoundary = policy.boundary;
    }
    if (policy.relationshipRules?.length)
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Required relationship resolver ещё не подключён.",
      );
    if (policy.boundary === "generated")
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Generated boundary требует generator binding.",
      );
    if (policy.excludedPaths?.some((root) => contains(root, path)))
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Путь исключён политикой предка.",
      );
    if (policy.allowedKinds !== undefined)
      kinds = kinds.filter((kind) => policy.allowedKinds!.includes(kind));
    if (policy.allowedProvenance !== undefined)
      provenance = provenance.filter((kind) =>
        policy.allowedProvenance!.includes(kind),
      );
    policy.requiredCheckRefs?.forEach((check) => checks.add(check));
    policy.sourcePaths.forEach((source) => sources.add(source));
  }
  if (!kinds.length || !provenance.includes("authored"))
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Пересечение политик запрещает authored artifact.",
    );
  const nearest = applicable.at(-1)!;
  return {
    id: nearest.id,
    version: nearest.version,
    ownerRef: nearest.ownerRef,
    allowedKinds: kinds,
    allowedProvenance: provenance,
    requiredCheckRefs: [...checks].sort(),
    sourcePaths: [...sources].sort(),
    executionBoundary,
  };
}

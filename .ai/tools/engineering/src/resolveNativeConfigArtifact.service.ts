/**
 * @file .ai/tools/engineering/src/resolveNativeConfigArtifact.service.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Подтверждает native JSON/JSONC profile только явно зарегистрированного dependent config effect.
 * @see documentation/architecture/engineering-artifacts.md
 */
import type { ResolvedArtifactDescriptor } from "@realize/engineering-runtime";
import type {
  ProjectArtifactBindingOptions,
  ProjectFolderPolicy,
} from "./ProjectArtifactBinding.types.ts";
import { resolveProjectFolderPolicy } from "./resolveProjectFolderPolicy.validator.ts";
import { collectArtifactReferences } from "./collectArtifactReferences.service.ts";
import {
  ARTIFACT_LIMITS,
  BINDING_SOURCE_PATHS,
  MOVE_SOURCE_PATHS,
} from "./projectArtifactProfiles.config.ts";
import { rewriteTsconfigPaths } from "./rewriteTsconfigPaths.util.ts";
import { rewritePackageExports } from "./rewritePackageExports.util.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";

/** Прямые create/edit/move/remove не используют этот dependent-only profile. */
export function resolveNativeConfigArtifact(
  path: string,
  content: Uint8Array,
  readReference: ProjectArtifactBindingOptions["readReference"],
  policies: readonly ProjectFolderPolicy[],
  kind: "config.tsconfig" | "config.package-exports",
): ResolvedArtifactDescriptor {
  const policy = resolveProjectFolderPolicy(policies, path);
  if (
    !policy.allowedKinds.includes(kind) ||
    !policy.allowedProvenance.includes("authored") ||
    !content.byteLength ||
    content.byteLength > ARTIFACT_LIMITS.contentBytes
  )
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Config effect не разрешён native folder policy или превышает размер.",
    );
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      content,
    );
  } catch {
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Config должен быть UTF-8 JSON/JSONC.",
    );
  }
  const packageExports = kind === "config.package-exports";
  (packageExports ? rewritePackageExports : rewriteTsconfigPaths)(
    path,
    source,
    new Map(),
  );
  const refs = collectArtifactReferences(readReference);
  [
    ...BINDING_SOURCE_PATHS,
    ...MOVE_SOURCE_PATHS,
    ...policy.sourcePaths,
    "package.json",
    "documentation/architecture/engineering-artifacts.md",
  ].forEach(refs.require);
  const validatedChecks = [
    "folder.placement",
    packageExports ? "config.json" : "config.jsonc",
  ];
  return {
    kindId: kind,
    definitionVersion: 1,
    ownerRef: policy.ownerRef,
    provenance: "authored",
    folderPolicyRef: { id: policy.id, version: policy.version },
    metadataProfileRef: {
      id: packageExports ? "package-exports.native" : "tsconfig.native",
      version: "1",
    },
    templateRef: null,
    ruleRefs: [],
    requiredCheckRefs: [
      ...new Set([...policy.requiredCheckRefs, ...validatedChecks]),
    ].sort(),
    validatedChecks,
    readPaths: refs.paths(),
  };
}

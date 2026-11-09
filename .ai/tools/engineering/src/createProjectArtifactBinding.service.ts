/**
 * @file .ai/tools/engineering/src/createProjectArtifactBinding.service.ts
 * @version 1.4.0
 * @date 2026-11-09
 * @description Разрешает registered project artifact profiles с native guards и неизменной trusted policy identity.
 * @see documentation/architecture/engineering-artifacts.md
 */
import { validateCodexAgent } from "./validateCodexAgent.validator.ts";
import { posix } from "node:path";
import { hashEngineeringValue } from "@realize/engineering-runtime";
import type { ArtifactDescriptorPort } from "@realize/engineering-runtime";
import type { ProjectArtifactBindingOptions } from "./ProjectArtifactBinding.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { resolveNativeConfigArtifact } from "./resolveNativeConfigArtifact.service.ts";
import { collectArtifactReferences } from "./collectArtifactReferences.service.ts";
import {
  ARTIFACT_LIMITS,
  BASE_AI_TEMPLATE,
  BINDING_SOURCE_PATHS,
  SOURCE_HEADER_TEMPLATE,
  SOURCE_RULE_REFS,
  SOURCE_VALIDATOR_PATHS,
  SOURCE_ARTIFACT_PROFILES,
  TEMPLATE_RULE_REFS,
  TEMPLATE_VALIDATOR_PATHS,
} from "./projectArtifactProfiles.config.ts";
import {
  assertArtifactPath,
  resolveProjectFolderPolicy,
  validateProjectFolderPolicies,
} from "./resolveProjectFolderPolicy.validator.ts";
import { validateSourceArtifact } from "./validateSourceArtifact.validator.ts";
import { validateAiTemplate } from "./validateAiTemplate.validator.ts";
import { validateProjectMovePolicy } from "./validateProjectMovePolicy.validator.ts";
import { prepareProjectArtifactMove } from "./prepareProjectArtifactMove.service.ts";
import { prepareProjectDirectoryMove } from "./prepareProjectDirectoryMove.service.ts";
import type { ProjectArtifactMoveOptions } from "./ProjectArtifactMove.types.ts";
import { resolveProjectArtifactKind } from "./resolveProjectArtifactKind.util.ts";

/** Snapshot конфигурации не меняется вслед за caller objects; FS/recovery остаются в core. */
export function createProjectArtifactBinding(
  options: ProjectArtifactBindingOptions,
): ArtifactDescriptorPort {
  if (!options || typeof options.readReference !== "function")
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Нужен trusted reference reader.",
    );
  const policies = validateProjectFolderPolicies(options.folderPolicies);
  const movePolicy = validateProjectMovePolicy(options.movePolicy);
  const readReference = options.readReference;
  const inventory = structuredClone(options.templateIds ?? []);
  if (
    !Array.isArray(inventory) ||
    inventory.length > ARTIFACT_LIMITS.inventory ||
    inventory.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        !/^TEMPLATE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(item.id) ||
        item.id.length > 128 ||
        typeof item.path !== "string" ||
        !item.path.endsWith(`/${item.id}.md`),
    )
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Некорректный bounded template inventory.",
    );
  inventory.forEach((item) => assertArtifactPath(item.path));
  const bindingSourcePaths = [...BINDING_SOURCE_PATHS];
  const profileIdentity = structuredClone({
    source: {
      profiles: SOURCE_ARTIFACT_PROFILES,
      definitionVersion: 2,
      checks: [
        "source.header",
        "source.syntax",
        "source.naming",
        "source.references",
        "source.boundary",
      ],
      ruleRefs: SOURCE_RULE_REFS,
      nativeSources: SOURCE_VALIDATOR_PATHS,
      template: SOURCE_HEADER_TEMPLATE,
    },
    agent: {
      kindId: "codex.agent",
      definitionVersion: 1,
      checks: ["agent.native"],
      ruleRefs: [],
      nativeSources: [
        ".ai/tools/engineering/src/validateCodexAgent.validator.ts",
        ".ai/tools/engineering/src/renderCodexAgent.util.ts",
        ".ai/tools/engineering/src/CodexAgent.types.ts",
      ],
      template: "documentation/specifications/agent-authoring.md",
    },
    template: {
      kindId: "ai.template",
      definitionVersion: 1,
      checks: ["template.metadata", "template.local-links"],
      ruleRefs: TEMPLATE_RULE_REFS,
      nativeSources: TEMPLATE_VALIDATOR_PATHS,
      template: BASE_AI_TEMPLATE,
    },
    folder: { definitionVersion: 1, checks: ["folder.placement"] },
  });
  const definitionHash = hashEngineeringValue({
    schemaVersion: 1,
    policies,
    inventory,
    movePolicy,
    profileIdentity,
    bindingSourcePaths,
    limits: ARTIFACT_LIMITS,
  });

  const resolveFile: ProjectArtifactMoveOptions["resolveFile"] = (
    { path, artifactKind, content },
    readReference,
    inventory,
  ) => {
    if (
      artifactKind === "config.tsconfig" ||
      artifactKind === "config.package-exports"
    ) {
      if (
        path !==
        (artifactKind === "config.tsconfig"
          ? movePolicy?.tsconfigWrite?.path
          : movePolicy?.packageExportsWrite?.path)
      )
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Config effect не зарегистрирован trusted host.",
        );
      return resolveNativeConfigArtifact(
        path,
        content,
        readReference,
        policies,
        artifactKind,
      );
    }
    const policy = resolveProjectFolderPolicy(policies, path);
    const kind = resolveProjectArtifactKind(path);
    if (
      !policy.allowedKinds.includes(artifactKind) ||
      kind === null ||
      kind !== artifactKind
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Artifact kind не поддержан effective folder policy.",
      );
    if (
      !(content instanceof Uint8Array) ||
      !content.byteLength ||
      content.byteLength > ARTIFACT_LIMITS.contentBytes
    )
      throw new ProjectArtifactError(
        "LIMIT_EXCEEDED",
        "Пустой или слишком большой artifact.",
      );
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(content);
    } catch {
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Authored artifact должен содержать UTF-8.",
      );
    }
    const refs = collectArtifactReferences(readReference);
    [...bindingSourcePaths, ...policy.sourcePaths].forEach(refs.require);
    const profile =
      kind === "codex.agent"
        ? profileIdentity.agent
        : kind === "ai.template"
          ? profileIdentity.template
          : profileIdentity.source;
    [
      ...profile.ruleRefs,
      ...profile.nativeSources,
      profile.template,
      "package.json",
    ].forEach(refs.require);
    if (kind === "codex.agent") {
      validateCodexAgent(source);
    } else if (kind !== "ai.template") {
      validateSourceArtifact(path, source, policy.executionBoundary).forEach(
        (reference) => refs.rootedLink(path, source, reference),
      );
    } else {
      const metadata = validateAiTemplate(path, source);
      if (
        inventory.some(
          (item) => item.id === metadata.template_id && item.path !== path,
        )
      )
        throw new ProjectArtifactError(
          "CONFLICT",
          "Template ID уже занят в trusted inventory.",
        );
      metadata.related_artifacts.forEach((reference) =>
        refs.require(reference),
      );
      refs.localLinks(path, source);
    }
    const validatedChecks = ["folder.placement", ...profile.checks].sort();
    return {
      kindId: artifactKind,
      definitionVersion: profile.definitionVersion,
      ownerRef: policy.ownerRef,
      provenance: "authored" as const,
      folderPolicyRef: { id: policy.id, version: policy.version },
      metadataProfileRef: {
        id:
          kind === "codex.agent"
            ? "codex.agent.native"
            : kind === "ai.template"
              ? "ai.template.native"
              : "source.tsdoc",
        version: "1",
      },
      templateRef: { id: profile.template, version: "1" },
      ruleRefs: [...profile.ruleRefs],
      requiredCheckRefs: [
        ...new Set([...policy.requiredCheckRefs, ...validatedChecks]),
      ].sort(),
      validatedChecks,
      readPaths: refs.paths(),
    };
  };
  const assertMoveBoundary = (from: string, to: string) => {
    if (
      resolveProjectFolderPolicy(policies, from).executionBoundary !==
      resolveProjectFolderPolicy(policies, to).executionBoundary
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Перенос не меняет physical client/server boundary.",
      );
  };
  const binding: ArtifactDescriptorPort = {
    definitionHash,
    resolveExistingFile: ({ path, content, purpose }) => {
      const configKind =
        path === movePolicy?.tsconfigWrite?.path
          ? "config.tsconfig"
          : path === movePolicy?.packageExportsWrite?.path
            ? "config.package-exports"
            : undefined;
      if (purpose === "dependent_edit" && configKind)
        return resolveFile(
          { path, artifactKind: configKind, content },
          readReference,
          inventory,
        );
      const artifactKind = resolveProjectArtifactKind(path);
      if (!artifactKind)
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Existing artifact kind не зарегистрирован project binding.",
        );
      return resolveFile(
        { path, artifactKind, content },
        readReference,
        inventory,
      );
    },
    prepareDirectoryMove: (input, inventoryPort) =>
      prepareProjectDirectoryMove(input, inventoryPort, {
        policy: movePolicy,
        readReference,
        templateIds: inventory,
        resolveFile,
        assertMoveBoundary,
        resolveExistingDirectory(path) {
          const policy = resolveProjectFolderPolicy(policies, path);
          const refs = collectArtifactReferences(readReference);
          [
            ...bindingSourcePaths,
            ...policy.sourcePaths,
            ...SOURCE_RULE_REFS,
            "documentation/architecture/engineering-artifacts.md",
          ].forEach(refs.require);
          return {
            folderPolicyRef: { id: policy.id, version: policy.version },
            ownerRef: policy.ownerRef,
            purpose: policies.find((value) => value.id === policy.id)!.purpose,
            readPaths: refs.paths(),
            requiredCheckRefs: policy.requiredCheckRefs,
            validatedChecks: ["folder.placement"],
          };
        },
      }),
    resolveFile: (input) => {
      if (
        input.artifactKind === "config.tsconfig" ||
        input.artifactKind === "config.package-exports"
      )
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Config profile разрешён только как dependent move effect.",
        );
      return resolveFile(input, readReference, inventory);
    },
    prepareMove: (input, files) =>
      prepareProjectArtifactMove(input, files, {
        policy: movePolicy,
        readReference,
        templateIds: inventory,
        resolveFile,
        assertMoveBoundary,
      }),
    resolveDirectory({ path, purpose, folderPolicyId, plannedFilePaths }) {
      const policy = resolveProjectFolderPolicy(policies, path);
      if (folderPolicyId !== policy.id)
        throw new ProjectArtifactError(
          "CONFLICT",
          "Не совпадает effective folderPolicyId.",
        );
      if (
        typeof purpose !== "string" ||
        !purpose.trim() ||
        Buffer.byteLength(purpose) > 2048 ||
        purpose.includes("\0") ||
        !/^[a-z][a-z0-9-]*$/.test(posix.basename(path))
      )
        throw new ProjectArtifactError(
          "INVALID_INPUT",
          "Нужны осмысленное purpose и kebab-case имя папки.",
        );
      if (!Array.isArray(plannedFilePaths) || plannedFilePaths.length > 64)
        throw new ProjectArtifactError(
          "INVALID_INPUT",
          "Нужен bounded список планируемых файлов.",
        );
      plannedFilePaths.forEach(assertArtifactPath);
      if (!plannedFilePaths.some((file) => file.startsWith(`${path}/`)))
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Пустой каркас папок не создаётся.",
        );
      const refs = collectArtifactReferences(readReference);
      [
        ...bindingSourcePaths,
        ...policy.sourcePaths,
        ...profileIdentity.source.ruleRefs,
        "documentation/architecture/engineering-artifacts.md",
      ].forEach(refs.require);
      return {
        folderPolicyRef: { id: policy.id, version: policy.version },
        ownerRef: policy.ownerRef,
        purpose,
        readPaths: refs.paths(),
        requiredCheckRefs: policy.requiredCheckRefs,
        validatedChecks: ["folder.placement"],
      };
    },
  };
  return Object.freeze(binding);
}

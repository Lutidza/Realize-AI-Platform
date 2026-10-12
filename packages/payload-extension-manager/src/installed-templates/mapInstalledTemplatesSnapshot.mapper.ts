/**
 * @file packages/payload-extension-manager/src/installed-templates/mapInstalledTemplatesSnapshot.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Формирует allowlist установленного runtime inventory без записи или вымышленного installer receipt.
 * @see documentation/specifications/extension-management.md
 */
import type { TemplateTarget } from "@realize/template-contracts";
import type { ExtensionAssignment } from "../appearance/ExtensionAppearance.types";
import type { ExtensionCatalogEntry } from "../catalog/ExtensionCatalog.types";
import type {
  InstalledTemplateActionsDto,
  InstalledTemplateEntryDto,
  InstalledTemplatesLoaderContext,
  InstalledTemplatesSnapshotDto,
} from "./InstalledTemplates.types";
import { getInstalledCompatibleTargets } from "./getInstalledCompatibleTargets.validator";
import { getInstalledAssignmentIssue } from "./getInstalledAssignmentIssue.validator";
import { mapInstalledTemplateRuntime } from "./mapInstalledTemplateRuntime.mapper";
import { installedTemplatesSnapshotSchema } from "./installedTemplates.schemas";

function refersTo(
  assignment: ExtensionAssignment | null,
  entry: ExtensionCatalogEntry,
) {
  return (
    assignment?.selection.templateId === entry.manifest.id &&
    assignment.selection.templateVersion === entry.manifest.version
  );
}

function actionsFor(
  input: InstalledTemplatesLoaderContext,
  verified: boolean,
  availability: InstalledTemplateEntryDto["availability"],
  settings: boolean,
): InstalledTemplateActionsDto {
  const reason = !input.manageAppearance
    ? "read_only"
    : !input.storageReady
      ? "requires_schema"
      : !verified
        ? "runtime_unverified"
        : availability !== "available"
          ? "unavailable"
          : null;
  return {
    settings: reason === null && settings,
    select: reason === null,
    reason,
  };
}

function mapPackage(
  input: InstalledTemplatesLoaderContext,
  entry: ExtensionCatalogEntry,
  verified: boolean,
): InstalledTemplateEntryDto {
  const targets = entry.manifest.targets.map(({ target }) => target);
  const compatible = getInstalledCompatibleTargets(input.catalog, entry);
  const enabled = compatible.filter(
    (target) => target !== "admin" || input.policy?.enabled.template !== false,
  );
  const availability =
    enabled.length > 0
      ? "available"
      : compatible.length === 0
        ? "incompatible"
        : "disabled";
  const selectedTargets = targets.filter((target) =>
    refersTo(input.store.targets[target].current, entry),
  );
  const activeTargets = enabled.filter((target) => {
    if (target === "admin" && input.shellMode !== "template") return false;
    const assignment = input.assignmentByTarget[target];
    return (
      refersTo(assignment, entry) &&
      assignment !== null &&
      getInstalledAssignmentIssue(input.catalog, target, assignment) === null
    );
  });
  const defaultTargets = targets.filter((target) =>
    refersTo(input.bootstrapStore.targets[target].current, entry),
  );
  // Новый compatible package можно настроить как draft; повреждённый saved pointer не редактируется молча.
  const editable = enabled.some((target) => {
    const assignment = input.store.targets[target].current;
    if (!refersTo(assignment, entry)) return true;
    return (
      !input.requiresRecovery.includes(target) &&
      assignment !== null &&
      getInstalledAssignmentIssue(input.catalog, target, assignment) === null
    );
  });
  return {
    kind: "package",
    key: `package:${entry.manifest.id}@${entry.manifest.version}`,
    id: entry.manifest.id,
    name: entry.manifest.displayName,
    version: entry.manifest.version,
    packageName: entry.manifest.packageName,
    targets,
    installation: verified ? "confirmed" : "unverified",
    availability,
    usage: { selectedTargets, activeTargets, defaultTargets },
    palettes: entry.manifest.palettes.map((palette) => ({
      id: palette.id,
      version: palette.version,
      label: palette.label,
      modes: [...palette.modes],
    })),
    actions: actionsFor(input, verified, availability, editable),
  };
}

/** Only host-backed compiled catalog того же процесса может стать confirmed; сохранённый выбор не доказывает activation. */
export function mapInstalledTemplatesSnapshot(
  input: InstalledTemplatesLoaderContext,
): InstalledTemplatesSnapshotDto {
  const runtime = mapInstalledTemplateRuntime(input);
  const verified = runtime.status === "verified";
  const entries: InstalledTemplateEntryDto[] = [];
  if (input.policy !== null) {
    const availability = input.policy.enabled.native ? "available" : "disabled";
    entries.push({
      kind: "builtin",
      key: `builtin:payload-native@${input.policy.nativeVersion}`,
      id: "payload-native",
      name: "Payload Admin",
      version: input.policy.nativeVersion,
      packageName: null,
      targets: ["admin"],
      installation: verified ? "confirmed" : "unverified",
      availability,
      usage: {
        selectedTargets: input.selectedShellMode === "native" ? ["admin"] : [],
        activeTargets:
          input.shellMode === "native" && availability === "available"
            ? ["admin"]
            : [],
        defaultTargets: input.policy.defaultMode === "native" ? ["admin"] : [],
      },
      palettes: [],
      actions: actionsFor(input, verified, availability, false),
    });
  }
  entries.push(
    ...input.catalog.entries.map((entry) => mapPackage(input, entry, verified)),
  );
  const unavailableAssignments: InstalledTemplatesSnapshotDto["unavailableAssignments"] =
    [];
  for (const target of [
    "admin",
    "frontend",
  ] as const satisfies readonly TemplateTarget[]) {
    const assignment = input.store.targets[target].current;
    if (assignment === null) continue;
    const reason =
      getInstalledAssignmentIssue(input.catalog, target, assignment) ??
      (input.requiresRecovery.includes(target) ? "invalid_assignment" : null);
    if (reason !== null)
      unavailableAssignments.push({
        target,
        templateId: assignment.selection.templateId,
        templateVersion: assignment.selection.templateVersion,
        reason,
      });
  }
  return installedTemplatesSnapshotSchema.parse({
    schemaVersion: "1.0",
    runtime,
    entries,
    unavailableAssignments,
    storage: input.storageReady ? "ready" : "requires_schema",
    permissions: { manageAppearance: input.manageAppearance },
    observedAt: input.observedAt,
  });
}

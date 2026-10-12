/**
 * @file src/components/admin/extensions/extensionAppearanceDraft.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Выбирает compiled запись и начальный черновик из manifest/defaults и текущего назначения.
 */
import type {
  ExtensionAssignment,
  ExtensionCatalogEntryDto,
  ExtensionManagerSnapshotDto,
} from "@realize/payload-extension-manager/contracts";
import type {
  TemplateTarget,
  TemplateSettings,
  TemplateSelection,
} from "@realize/template-contracts";
import type { ExtensionAppearanceDraft } from "./ExtensionManager.types";

export const extensionTemplateKey = (entry: ExtensionCatalogEntryDto) =>
  `${entry.manifest.id}@${entry.manifest.version}`;
export const extensionEntriesForTarget = (
  entries: ExtensionCatalogEntryDto[],
  target: TemplateTarget,
) =>
  entries.filter((entry) =>
    entry.manifest.targets.some((item) => item.target === target),
  );
export const findExtensionDraftEntry = (
  entries: ExtensionCatalogEntryDto[],
  draft: ExtensionAppearanceDraft,
) =>
  entries.find(
    (entry) =>
      entry.manifest.id === draft.selection.templateId &&
      entry.manifest.version === draft.selection.templateVersion,
  );

export function createExtensionDraft(
  entry: ExtensionCatalogEntryDto,
  target: TemplateTarget,
  assignment?: {
    selection: TemplateSelection;
    settings: TemplateSettings;
  } | null,
): ExtensionAppearanceDraft {
  const palette =
    entry.manifest.palettes.find(
      (item) =>
        item.id === assignment?.selection.paletteId &&
        item.version === assignment.selection.paletteVersion,
    ) ?? entry.manifest.palettes[0];
  const mode =
    assignment && palette.modes.includes(assignment.selection.mode)
      ? assignment.selection.mode
      : palette.modes[0];
  return {
    selection: {
      templateId: entry.manifest.id,
      templateVersion: entry.manifest.version,
      target,
      paletteId: palette.id,
      paletteVersion: palette.version,
      mode,
    },
    settingsText: JSON.stringify(
      assignment?.settings ?? entry.manifest.settings.defaults,
      null,
      2,
    ),
  };
}

/** Встроенное оформление может ещё не иметь persisted assignment; это самостоятельный baseline. */
export function initialExtensionDraft(
  snapshot: ExtensionManagerSnapshotDto,
  target: TemplateTarget,
  fallback?: Omit<ExtensionAssignment, "manifestHash">,
): ExtensionAppearanceDraft | null {
  const entries = extensionEntriesForTarget(snapshot.catalog.entries, target);
  const current = snapshot.targets[target].current ?? fallback;
  const entry =
    entries.find(
      (item) =>
        item.manifest.id === current?.selection.templateId &&
        item.manifest.version === current.selection.templateVersion,
    ) ?? entries[0];
  if (!entry) return null;
  const assignment =
    current?.selection.templateId === entry.manifest.id &&
    current.selection.templateVersion === entry.manifest.version
      ? current
      : null;
  return createExtensionDraft(entry, target, assignment);
}

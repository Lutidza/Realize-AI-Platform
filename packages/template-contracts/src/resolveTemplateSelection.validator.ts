/**
 * @file packages/template-contracts/src/resolveTemplateSelection.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Выбирает известную точную пару template/palette для совместимого host.
 */

import { compareTemplateVersions } from "./compareTemplateVersions.util";
import { parseTemplateManifest } from "./parseTemplateManifest.validator";
import { TemplateContractError } from "./TemplateContract.error";
import type { ResolvedTemplateSelection } from "./TemplateManifest.types";
import {
  templateHostCompatibilitySchema,
  templateSelectionSchema,
} from "./templateManifest.schemas";

/** Все входы проверяются: запись каталога не является доказательством корректности. */
export function resolveTemplateSelection(input: {
  manifests: readonly unknown[];
  selection: unknown;
  host: unknown;
}): ResolvedTemplateSelection {
  const selected = templateSelectionSchema.safeParse(input.selection);
  if (!selected.success) throw new TemplateContractError("INVALID_SELECTION");
  const host = templateHostCompatibilitySchema.safeParse(input.host);
  if (!host.success) throw new TemplateContractError("INVALID_HOST");
  const manifests = input.manifests.map(parseTemplateManifest);
  const identities = manifests.map(
    (manifest) => `${manifest.id}@${manifest.version}`,
  );
  if (new Set(identities).size !== identities.length) {
    throw new TemplateContractError("DUPLICATE_TEMPLATE");
  }
  const selection = selected.data;
  const manifest = manifests.find(
    (candidate) =>
      candidate.id === selection.templateId &&
      candidate.version === selection.templateVersion,
  );
  if (!manifest) throw new TemplateContractError("UNKNOWN_TEMPLATE");
  const target = manifest.targets.find(
    (candidate) => candidate.target === selection.target,
  );
  if (!target) throw new TemplateContractError("UNSUPPORTED_TARGET");
  const versionPairs = [
    [host.data.platformVersion, manifest.compatibility.platform],
    [host.data.reactVersion, manifest.compatibility.react],
    [host.data.nextVersion, manifest.compatibility.next],
  ] as const;
  if (
    versionPairs.some(
      ([version, range]) =>
        compareTemplateVersions(version, range.minimum) < 0 ||
        compareTemplateVersions(version, range.maximumExclusive) >= 0,
    )
  ) {
    throw new TemplateContractError("INCOMPATIBLE_HOST");
  }
  if (
    (host.data.requiredCapabilities ?? []).some(
      (capability) => !target.capabilities?.includes(capability),
    )
  ) {
    throw new TemplateContractError("MISSING_CAPABILITY");
  }
  const palette = manifest.palettes.find(
    (candidate) =>
      candidate.id === selection.paletteId &&
      candidate.version === selection.paletteVersion,
  );
  if (!palette) throw new TemplateContractError("UNKNOWN_PALETTE");
  if (!palette.modes.includes(selection.mode))
    throw new TemplateContractError("UNSUPPORTED_MODE");
  return { manifest, palette, selection };
}

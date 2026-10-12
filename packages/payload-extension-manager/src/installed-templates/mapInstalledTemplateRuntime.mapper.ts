/**
 * @file packages/payload-extension-manager/src/installed-templates/mapInstalledTemplateRuntime.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проецирует runtime evidence только при точной привязке к build и compiled каталогу.
 * @see documentation/specifications/extension-management.md
 */
import { isTemplateSettings } from "@realize/template-contracts";
import type {
  InstalledTemplateRuntimeDto,
  InstalledTemplatesLoaderContext,
} from "./InstalledTemplates.types";
import { installedTemplateRuntimeEvidenceSchema } from "./installedTemplates.schemas";

/** Host уже проверил receipt против actual BUILD_ID; здесь дополнительно связывается exact catalog. */
export function mapInstalledTemplateRuntime(
  input: Pick<
    InstalledTemplatesLoaderContext,
    "runtime" | "catalog" | "observedAt"
  >,
): InstalledTemplateRuntimeDto {
  const unverified: InstalledTemplateRuntimeDto = {
    status: "unverified",
    buildId: null,
    sourceVersion: null,
    builtAt: null,
  };
  if (!isTemplateSettings(input.runtime)) return unverified;
  const parsed = installedTemplateRuntimeEvidenceSchema.safeParse(
    input.runtime,
  );
  if (
    !parsed.success ||
    parsed.data.buildId !== input.catalog.runtimeBuildId ||
    parsed.data.catalogHash !== input.catalog.catalogHash ||
    Date.parse(parsed.data.builtAt) > Date.parse(input.observedAt)
  )
    return unverified;
  return {
    status: "verified",
    buildId: parsed.data.buildId,
    sourceVersion: parsed.data.sourceVersion,
    builtAt: parsed.data.builtAt,
  };
}

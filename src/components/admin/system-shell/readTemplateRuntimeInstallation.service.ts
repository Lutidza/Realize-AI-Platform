/**
 * @file src/components/admin/system-shell/readTemplateRuntimeInstallation.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет production receipt против BUILD_ID текущего standalone процесса.
 * @see documentation/specifications/extension-management.md
 */
import type { InstalledTemplateRuntimeReceipt } from "@realize/payload-extension-manager/contracts";
import { readCompiledSearchBinding } from "../../../../.ai/tools/agent-search/src/installedSearchBinding.adapter.mjs";

/** Dev/source metadata не доказывает установку; active pointer чужой сборки не читается. */
export async function readTemplateRuntimeInstallation(): Promise<InstalledTemplateRuntimeReceipt | null> {
  if (process.env.NODE_ENV !== "production") return null;
  const receipt = await readCompiledSearchBinding(process.cwd(), {
    NODE_ENV: process.env.NODE_ENV,
    REALIZE_NEXT_DIST_DIR: ".next",
  });
  return receipt
    ? {
        schemaVersion: "1.0",
        buildId: receipt.installedBuildID,
        sourceVersion: receipt.sourceVersion,
        builtAt: receipt.builtAt,
      }
    : null;
}

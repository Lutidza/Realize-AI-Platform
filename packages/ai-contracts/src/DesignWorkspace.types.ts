/**
 * @file packages/ai-contracts/src/DesignWorkspace.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Описывает источник, manifest и квитанцию файловой версии Мастерской.
 * @see documentation/specifications/design-workshop.md
 */
import type { z } from "zod";
import type {
  designWorkspacePinSchema,
  designWorkspaceSourceSchema,
  designWorkspaceManifestSchema,
  designWorkspaceReceiptSchema,
} from "./designWorkspace.schemas";

export type DesignWorkspacePin = z.infer<typeof designWorkspacePinSchema>;
export type DesignWorkspaceSource = z.infer<typeof designWorkspaceSourceSchema>;
export type DesignWorkspaceManifest = z.infer<
  typeof designWorkspaceManifestSchema
>;
export type DesignWorkspaceReceipt = z.infer<
  typeof designWorkspaceReceiptSchema
>;

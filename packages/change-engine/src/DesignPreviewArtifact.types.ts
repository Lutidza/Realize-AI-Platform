/**
 * @file packages/change-engine/src/DesignPreviewArtifact.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Задаёт внутренний transport bounded PNG между renderer и persistence.
 * @see documentation/specifications/design-workshop.md
 */
import type { DesignPreviewEvidence } from "@realize/ai-contracts";
export type DesignPreviewArtifact = {
  evidence: DesignPreviewEvidence;
  images: Record<"390" | "768" | "1440", string>;
};

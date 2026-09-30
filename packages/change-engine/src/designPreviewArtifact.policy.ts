/**
 * @file packages/change-engine/src/designPreviewArtifact.policy.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет размер, подпись PNG, viewport и hash закрытого capture artifact.
 * @see documentation/specifications/design-workshop.md
 */
import { createHash } from "node:crypto";
import {
  ContractValidationError,
  DESIGN_PREVIEW as limits,
  designPreviewEvidenceSchema,
} from "@realize/ai-contracts";
import type { DesignPreviewArtifact } from "./DesignPreviewArtifact.types";

export function validateDesignPreviewArtifact(
  evidenceValue: unknown,
  imagesValue: unknown,
): DesignPreviewArtifact {
  const parsed = designPreviewEvidenceSchema.safeParse(evidenceValue);
  const fail = (): never => {
    throw new ContractValidationError("Некорректный результат предпросмотра.");
  };
  if (
    !parsed.success ||
    typeof imagesValue !== "object" ||
    imagesValue === null ||
    Array.isArray(imagesValue)
  )
    return fail();
  const images = imagesValue as Record<string, unknown>;
  if (Object.keys(images).sort().join(",") !== "1440,390,768") return fail();
  const result: DesignPreviewArtifact["images"] = {
    "390": "",
    "768": "",
    "1440": "",
  };
  for (const image of parsed.data.images) {
    const value = images[String(image.width)];
    if (
      typeof value !== "string" ||
      value.length > Math.ceil(limits.imageBytes / 3) * 4
    )
      return fail();
    const bytes = Buffer.from(value, "base64");
    if (
      bytes.toString("base64") !== value ||
      bytes.length !== image.bytes ||
      bytes.length < 33 ||
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.subarray(12, 16).toString("ascii") !== "IHDR" ||
      bytes.readUInt32BE(16) !== image.width ||
      bytes.readUInt32BE(20) !== image.height ||
      createHash("sha256").update(bytes).digest("hex") !== image.sha256
    )
      return fail();
    result[String(image.width) as keyof typeof result] = value;
  }
  return { evidence: parsed.data, images: result };
}

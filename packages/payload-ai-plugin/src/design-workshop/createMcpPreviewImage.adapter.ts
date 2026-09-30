/**
 * @file packages/payload-ai-plugin/src/design-workshop/createMcpPreviewImage.adapter.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Создаёт bounded JPEG для MCP из проверенного PNG без файлов и публичных URL.
 * @see documentation/specifications/design-workshop.md
 */
import sharp from "sharp";
import type {
  DesignPreviewJobDto,
  McpWorkshopImageResult,
} from "@realize/ai-contracts";
import { EndpointError } from "../endpoints/http";
export async function createMcpPreviewImage(
  png: Buffer,
  job: DesignPreviewJobDto,
  viewportWidth: 390 | 768 | 1440,
  responseBytes: number,
): Promise<McpWorkshopImageResult> {
  const source = job.evidence?.images.find(
    (image) => image.width === viewportWidth,
  );
  if (!source) throw new EndpointError("CONFLICT", "Снимок недоступен.", 409);
  for (const width of [640, 480, 320, 160, 80]) {
    const { data, info } = await sharp(png, { limitInputPixels: 1440 * 900 })
      .resize({
        width: Math.min(viewportWidth, width),
        height: 900,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 65, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (Math.ceil(data.length / 3) * 4 + 4096 <= responseBytes)
      return {
        metadata: {
          jobId: job.jobId,
          source: job.source,
          viewportWidth,
          viewportHeight: 900,
          sourceSha256: source.sha256,
          width: info.width,
          height: info.height,
          mimeType: "image/jpeg",
        },
        imageData: data.toString("base64"),
      };
  }
  throw new EndpointError(
    "INTEGRATION_UNAVAILABLE",
    "Снимок превышает доступный лимит ответа.",
    503,
  );
}

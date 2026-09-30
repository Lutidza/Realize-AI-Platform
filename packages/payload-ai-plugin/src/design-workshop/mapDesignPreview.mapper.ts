/**
 * @file packages/payload-ai-plugin/src/design-workshop/mapDesignPreview.mapper.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Формирует статус preview без PNG, actor, request keys и worker lease.
 * @see documentation/specifications/design-workshop.md
 */
import {
  designPreviewJobSchema,
  type DesignPreviewJobDto,
} from "@realize/ai-contracts";
import type { DesignPreviewRecord } from "./DesignPreview.types";
export function mapDesignPreview(
  record: DesignPreviewRecord,
): DesignPreviewJobDto {
  const expired = new Date(record.expiresAt).getTime() <= Date.now();
  return designPreviewJobSchema.parse({
    jobId: record.jobId,
    projectId: record.projectId,
    source: record.sourcePin,
    entryPath: record.entryPath,
    state: expired ? "expired" : record.state,
    attempt: record.attempt,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    error: expired ? null : (record.errorCode ?? null),
    evidence:
      !expired && record.state === "completed"
        ? (record.evidence ?? null)
        : null,
  });
}

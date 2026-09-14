/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublication.mapper.ts
 * @version 1.1.0
 * @date 2026-09-14
 * @description Проецирует закрытые публикационные снимки в allowlisted card DTO без raw Pages.
 */
import type {
  PagePublicationDeliveryDTO,
  PagePublicationResultDTO,
} from "@realize/ai-contracts";
import { parsePagePublicationPreview } from "@realize/ai-contracts";
import { readPagePublicationSnapshot } from "./pagePublicationSnapshot.mapper";
import type { AppliedPagePublicationSnapshot } from "./PagePublication.types";
import type { AIDocument } from "./repository";
import { EndpointError } from "./http";

export const toPagePublicationFields = (
  operation: AIDocument,
  delivery?: PagePublicationDeliveryDTO,
  adminRoute = "/admin",
) => {
  const snapshot = readPagePublicationSnapshot(operation);
  const preview = parsePagePublicationPreview(snapshot.preview);
  const applied = operation.appliedSnapshot as
    AppliedPagePublicationSnapshot | undefined;
  let result: PagePublicationResultDTO | undefined;
  if (operation.state === "applied") {
    if (
      !applied ||
      applied.pageID !== preview.page.id ||
      typeof applied.adminUrl !== "string" ||
      !/^\/(?!\/)[A-Za-z0-9/_%-]+$/.test(applied.adminUrl) ||
      (applied.publicUrl !== undefined &&
        (typeof applied.publicUrl !== "string" ||
          !/^\/(?!\/)[A-Za-z0-9._%/-]*$/.test(applied.publicUrl)))
    )
      throw new EndpointError(
        "CONFLICT",
        "Результат публикации не соответствует выбранной странице.",
        409,
      );
    result = {
      page: preview.after.page,
      adminUrl: applied.adminUrl,
      ...(applied.publicUrl ? { publicUrl: applied.publicUrl } : {}),
      delivery: delivery ?? { status: "pending" },
    };
  }
  const fields = {
    riskLevel: "R2" as const,
    adminUrl: `${adminRoute.replace(/\/$/, "")}/collections/pages/${encodeURIComponent(preview.page.id)}`,
    expectedTargetUpdatedAt: String(snapshot.revision.page.updatedAt),
    preview,
    ...(result ? { result } : {}),
  };
  return snapshot.mode === "publish"
    ? {
        ...fields,
        kind: "pages.publishDraft.v1" as const,
        rollbackStrategy: "restore-publication" as const,
      }
    : {
        ...fields,
        kind: "pages.restorePublication.v1" as const,
        rollbackStrategy: "none" as const,
      };
};

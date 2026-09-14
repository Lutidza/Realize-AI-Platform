/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublicationApproval.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Связывает явное свидетельство просмотра с проверенным manifest и отдельным решением о публикации.
 */
import {
  parsePagePublicationReview,
  parsePagePublicationEvidence,
  type PagePublicationReviewEvidenceDTO,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { EndpointError } from "./http";
import { PagePublication } from "./pagePublication.service";
import { readPagePublicationSnapshot } from "./pagePublicationSnapshot.mapper";
import type { AIDocument } from "./repository";

/** Вызывается в transaction решения; HTML/клик не заменяют эту явную attestation. */
export const preparePagePublicationApproval = async (
  req: PayloadRequest,
  operation: AIDocument,
  review: unknown,
): Promise<PagePublicationReviewEvidenceDTO | undefined> => {
  const snapshot = await new PagePublication(req.payload, req).assertCurrent(
    operation,
  );
  if (operation.kind === "pages.restorePublication.v1") {
    if (review !== undefined)
      throw new EndpointError(
        "INVALID_REQUEST",
        "Восстановление требует собственного подтверждения, без свидетельства просмотра другого черновика.",
        400,
      );
    return undefined;
  }
  const parsed = parsePagePublicationReview(review);
  if (parsed.manifestHash !== snapshot.preview.manifestHash)
    throw new EndpointError(
      "CONFLICT",
      "Подтверждение относится к другой версии. Проверьте выбранную страницу заново.",
      409,
    );
  return { version: "1.0", reviewedAt: new Date().toISOString(), ...parsed };
};

export const assertPagePublicationReviewApproval = (
  operation: AIDocument,
  approval: AIDocument,
) => {
  if (operation.kind !== "pages.publishDraft.v1") return;
  const snapshot = readPagePublicationSnapshot(operation);
  const evidence = parsePagePublicationEvidence(approval.previewEvidence);
  if (
    evidence.manifestHash !== snapshot.preview.manifestHash ||
    Date.parse(evidence.reviewedAt) < Date.parse(String(operation.createdAt)) ||
    Date.parse(evidence.reviewedAt) > Date.now() ||
    Date.parse(evidence.reviewedAt) >= Date.parse(String(operation.expiresAt))
  )
    throw new EndpointError(
      "CONFLICT",
      "Нет действительного подтверждения просмотра публикуемой версии.",
      409,
    );
};

export const assertPagePublicationReviewReplay = (
  operation: AIDocument,
  approval: AIDocument,
  review: unknown,
) => {
  if (operation.kind !== "pages.publishDraft.v1") return;
  const input = parsePagePublicationReview(review);
  const saved = parsePagePublicationEvidence(approval.previewEvidence);
  if (input.manifestHash !== saved.manifestHash)
    throw new EndpointError(
      "CONFLICT",
      "Для этой операции уже сохранено другое подтверждение просмотра.",
      409,
    );
};

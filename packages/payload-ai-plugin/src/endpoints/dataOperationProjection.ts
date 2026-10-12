/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationProjection.ts
 * @version 1.2.1
 * @date 2026-10-12
 * @description Собирает DataOperation DTO из aggregate и append-only decisions.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { DataOperationDTO } from "@realize/ai-contracts";
import type { Payload, PayloadRequest } from "payload";

import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import { toDataOperationDTO } from "./dataOperationMapper";
import type { AIDocument } from "./repository";
import { isPagePublicationKind } from "./pagePublicationAccess.service";
import { getPagePublicationDelivery } from "./pagePublicationDelivery.service";

/** Loads independent decisions and returns one browser-safe projection. */
export const projectDataOperation = async (input: {
  operation: AIDocument;
  payload: Payload;
  req: PayloadRequest;
}): Promise<DataOperationDTO> => {
  const audit = new DataOperationAuditRepository(input.payload, input.req);
  const [approval, rollbackApproval] = await Promise.all([
    audit.getApproval(String(input.operation.id), "WRITE_CONFIRMATION"),
    audit.getApproval(String(input.operation.id), "ROLLBACK_APPROVAL"),
  ]);
  return toDataOperationDTO({
    adminRoute: input.payload.config.routes.admin,
    apiRoute: input.payload.config.routes.api,
    approval,
    operation: input.operation,
    rollbackApproval,
    ...(isPagePublicationKind(input.operation.kind) &&
    input.operation.state === "applied"
      ? {
          delivery: await getPagePublicationDelivery(
            input.req,
            String(input.operation.id),
          ),
        }
      : {}),
  });
};

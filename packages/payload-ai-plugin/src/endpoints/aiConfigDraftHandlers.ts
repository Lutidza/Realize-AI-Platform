/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigDraftHandlers.ts
 * @version 2026-09-01
 * @description Создаёт и optimistic-replaces editable configuration drafts.
 * @docref Realize AI Commerce v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import {
  parseAIConfigResourceID,
  parseCreateAIConfigDraftInput,
  parseUpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireAIConfigurationManager } from "./access";
import {
  configRequestHash,
  configResponseSnapshot,
  requireArtifactRevisions,
  requireBaseRelease,
  requireDraftRevision,
} from "./aiConfigHandlerSupport";
import {
  parseAIConfigDraftSummaryDTO,
  toAIConfigDraft,
  toAIConfigDraftSummaryDTO,
} from "./aiConfigDraftMapper";
import { AIConfigRepository } from "./aiConfigRepository";
import { withAIConfigMutationReplay } from "./aiConfigReplay";
import { EndpointError, success } from "./http";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

/** Creates the mutation boundary for editable draft aggregates. */
export const createAIConfigDraftHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  create: PayloadEndpointHandler;
  update: PayloadEndpointHandler;
} => ({
  create: withHandler(async (req, correlationID) => {
    const user = await requireAIConfigurationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseCreateAIConfigDraftInput(await readBody(req));
    const requestHash = configRequestHash("draft_created", input);
    const repository = new AIConfigRepository(req.payload, req);
    const result = await withAIConfigMutationReplay({
      idempotencyKey,
      operation: async () => {
        if (await repository.getDraft(input.draftID)) {
          throw new EndpointError(
            "CONFLICT",
            "AI configuration draft already exists.",
            409,
          );
        }
        await requireBaseRelease(repository, input.baseRelease);
        requireArtifactRevisions({ artifacts: input.artifacts });
        const draft = await repository.createDraft({
          actorID: user.id,
          artifacts: input.artifacts,
          baseRelease: input.baseRelease,
          draftID: input.draftID,
        });
        const summary = toAIConfigDraftSummaryDTO(draft);
        await repository.recordEvent({
          action: "draft_created",
          actorID: user.id,
          idempotencyKey,
          requestHash,
          resourceID: input.draftID,
          resourceKind: "draft",
          responseSnapshot: configResponseSnapshot(summary),
          status: "succeeded",
        });
        return summary;
      },
      repository,
      req,
      scope: {
        action: "draft_created",
        actorID: user.id,
        parse: parseAIConfigDraftSummaryDTO,
        requestHash,
        resourceID: input.draftID,
        resourceKind: "draft",
      },
    });
    return success(result, correlationID, 201);
  }),

  update: withHandler(async (req, correlationID) => {
    const user = await requireAIConfigurationManager(req, options);
    consumeRateLimit(user.id);
    const draftID = parseAIConfigResourceID(
      req.routeParams?.id,
      "AI configuration draft id",
    );
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseUpdateAIConfigDraftInput(await readBody(req));
    const requestHash = configRequestHash("draft_updated", { draftID, input });
    const repository = new AIConfigRepository(req.payload, req);
    const result = await withAIConfigMutationReplay({
      idempotencyKey,
      operation: async () => {
        const current = toAIConfigDraft(await repository.requireDraft(draftID));
        requireDraftRevision(current, input.expectedRevision);
        await requireBaseRelease(repository, input.baseRelease);
        requireArtifactRevisions({
          artifacts: input.artifacts,
          current,
        });
        const draft = await repository.replaceDraft({
          actorID: user.id,
          artifacts: input.artifacts,
          baseRelease: input.baseRelease,
          draftID,
          expectedRevision: input.expectedRevision,
        });
        const summary = toAIConfigDraftSummaryDTO(draft);
        await repository.recordEvent({
          action: "draft_updated",
          actorID: user.id,
          idempotencyKey,
          requestHash,
          resourceID: draftID,
          resourceKind: "draft",
          responseSnapshot: configResponseSnapshot(summary),
          status: "succeeded",
        });
        return summary;
      },
      repository,
      req,
      scope: {
        action: "draft_updated",
        actorID: user.id,
        parse: parseAIConfigDraftSummaryDTO,
        requestHash,
        resourceID: draftID,
        resourceKind: "draft",
      },
    });
    return success(result, correlationID);
  }),
});

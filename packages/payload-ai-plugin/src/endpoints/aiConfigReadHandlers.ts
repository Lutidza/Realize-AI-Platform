/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigReadHandlers.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Возвращает authorized bootstrap, draft и immutable release DTO.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import {
  parseAIConfigResourceID,
  type AIConfigBootstrapDTO,
} from "@realize/ai-contracts";
import { SYSTEM_AI_CONFIG_PROJECTION } from "@realize/change-engine";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { requireAIConfigurationManager } from "./access";
import {
  toAIConfigDraftDTO,
  toAIConfigDraftSummaryDTO,
} from "./aiConfigDraftMapper";
import { toActiveAIConfigPointerDTO } from "./aiConfigPointerMapper";
import {
  toAIConfigReleaseDTO,
  toAIConfigReleaseSummaryDTO,
} from "./aiConfigReleaseMapper";
import { AIConfigRepository } from "./aiConfigRepository";
import { success } from "./http";
import { withHandler } from "./request";

/** Creates the read-only half of the configuration management API. */
export const createAIConfigReadHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  bootstrap: PayloadEndpointHandler;
  draft: PayloadEndpointHandler;
  release: PayloadEndpointHandler;
} => ({
  bootstrap: withHandler(async (req, correlationID) => {
    await requireAIConfigurationManager(req, options);
    const repository = new AIConfigRepository(req.payload, req);
    const [drafts, releases, activePointer] = await Promise.all([
      repository.listDrafts(),
      repository.listReleases(),
      repository.getActivePointer(),
    ]);
    const data: AIConfigBootstrapDTO = {
      activePointer: toActiveAIConfigPointerDTO(activePointer),
      drafts: drafts.map(toAIConfigDraftSummaryDTO),
      releases: releases.map(toAIConfigReleaseSummaryDTO),
      schemaVersion: "1.0",
      system: SYSTEM_AI_CONFIG_PROJECTION,
    };
    return success(data, correlationID);
  }),

  draft: withHandler(async (req, correlationID) => {
    await requireAIConfigurationManager(req, options);
    const draftID = parseAIConfigResourceID(
      req.routeParams?.id,
      "AI configuration draft id",
    );
    const draft = await new AIConfigRepository(req.payload, req).requireDraft(
      draftID,
    );
    return success(toAIConfigDraftDTO(draft), correlationID);
  }),

  release: withHandler(async (req, correlationID) => {
    await requireAIConfigurationManager(req, options);
    const releaseID = parseAIConfigResourceID(
      req.routeParams?.id,
      "AI configuration release id",
    );
    const release = await new AIConfigRepository(
      req.payload,
      req,
    ).requireRelease(releaseID);
    return success(toAIConfigReleaseDTO(release), correlationID);
  }),
});

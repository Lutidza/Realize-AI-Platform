/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigReleaseHandlers.ts
 * @version 2026-09-01
 * @description Валидирует exact draft и создаёт immutable config release atomically.
 * @docref Realize AI Commerce v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import {
  parseCreateAIConfigReleaseInput,
  parseValidateAIConfigDraftInput,
  type AIConfigValidationDTO,
} from "@realize/ai-contracts";
import {
  createAIConfigRelease,
  SYSTEM_AI_CONFIG_PROJECTION,
  validateAIConfigDraftForSystem,
} from "@realize/change-engine";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireAIConfigurationManager } from "./access";
import { toAIConfigDraft } from "./aiConfigDraftMapper";
import {
  boundedValidationIssues,
  configRequestHash,
  configResponseSnapshot,
  requireDraftRevision,
} from "./aiConfigHandlerSupport";
import {
  parseAIConfigReleaseSummaryDTO,
  toAIConfigReleaseSummaryDTO,
} from "./aiConfigReleaseMapper";
import { AIConfigRepository } from "./aiConfigRepository";
import { withAIConfigMutationReplay } from "./aiConfigReplay";
import { parseAIConfigValidationDTO } from "./aiConfigValidationMapper";
import { EndpointError, success } from "./http";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

/** Creates validation and immutable release command handlers. */
export const createAIConfigReleaseHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  create: PayloadEndpointHandler;
  validate: PayloadEndpointHandler;
} => ({
  validate: withHandler(async (req, correlationID) => {
    const user = await requireAIConfigurationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseValidateAIConfigDraftInput(await readBody(req));
    const requestHash = configRequestHash("draft_validated", input);
    const repository = new AIConfigRepository(req.payload, req);
    const result = await withAIConfigMutationReplay({
      idempotencyKey,
      operation: async () => {
        const draft = toAIConfigDraft(
          await repository.requireDraft(input.draftID),
        );
        requireDraftRevision(draft, input.expectedRevision, "editing");
        const validation = validateAIConfigDraftForSystem({
          draft,
          system: SYSTEM_AI_CONFIG_PROJECTION,
        });
        const issues = boundedValidationIssues(validation.issues);
        const response: AIConfigValidationDTO = validation.valid
          ? {
              checkedRevision: input.expectedRevision,
              draftID: input.draftID,
              issues: [],
              resultingRevision: input.expectedRevision + 1,
              state: "ready",
              systemManifestHash: SYSTEM_AI_CONFIG_PROJECTION.manifestHash,
              valid: true,
            }
          : {
              checkedRevision: input.expectedRevision,
              draftID: input.draftID,
              issues,
              resultingRevision: input.expectedRevision,
              state: "editing",
              systemManifestHash: SYSTEM_AI_CONFIG_PROJECTION.manifestHash,
              valid: false,
            };
        if (validation.valid) {
          await repository.setDraftState({
            actorID: user.id,
            draftID: input.draftID,
            expectedRevision: input.expectedRevision,
            expectedState: "editing",
            state: "ready",
          });
        }
        await repository.recordEvent({
          action: "draft_validated",
          actorID: user.id,
          idempotencyKey,
          requestHash,
          resourceID: input.draftID,
          resourceKind: "draft",
          responseSnapshot: configResponseSnapshot(response),
          status: validation.valid ? "succeeded" : "validation_failed",
        });
        return response;
      },
      repository,
      req,
      scope: {
        action: "draft_validated",
        actorID: user.id,
        parse: parseAIConfigValidationDTO,
        requestHash,
        resourceID: input.draftID,
        resourceKind: "draft",
      },
    });
    return success(result, correlationID);
  }),

  create: withHandler(async (req, correlationID) => {
    const user = await requireAIConfigurationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseCreateAIConfigReleaseInput(await readBody(req));
    const requestHash = configRequestHash("release_created", input);
    const repository = new AIConfigRepository(req.payload, req);
    const result = await withAIConfigMutationReplay({
      idempotencyKey,
      operation: async () => {
        if (
          input.expectedSystemManifestHash !==
          SYSTEM_AI_CONFIG_PROJECTION.manifestHash
        ) {
          throw new EndpointError(
            "CONFLICT",
            "System AI configuration changed. Validate the draft again.",
            409,
          );
        }
        const draft = toAIConfigDraft(
          await repository.requireDraft(input.draftID),
        );
        requireDraftRevision(draft, input.expectedDraftRevision, "ready");
        const validation = validateAIConfigDraftForSystem({
          draft,
          system: SYSTEM_AI_CONFIG_PROJECTION,
        });
        if (!validation.valid) {
          throw new EndpointError(
            "INVALID_REQUEST",
            "AI configuration draft validation failed.",
            400,
            { issues: boundedValidationIssues(validation.issues) },
          );
        }
        const version = await repository.nextReleaseVersion();
        const release = createAIConfigRelease({
          createdAt: new Date().toISOString(),
          createdBy: String(user.id),
          draft,
          releaseID: `installation-config-v${version}`,
          releaseVersion: version,
          systemCompatibility: {
            maximumRelease: SYSTEM_AI_CONFIG_PROJECTION.version,
            minimumRelease: SYSTEM_AI_CONFIG_PROJECTION.version,
          },
        });
        const document = await repository.createRelease(release, user.id);
        await repository.setDraftState({
          actorID: user.id,
          draftID: input.draftID,
          expectedRevision: input.expectedDraftRevision,
          expectedState: "ready",
          state: "released",
        });
        const summary = toAIConfigReleaseSummaryDTO(document);
        await repository.recordEvent({
          action: "release_created",
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
        action: "release_created",
        actorID: user.id,
        parse: parseAIConfigReleaseSummaryDTO,
        requestHash,
        resourceID: input.draftID,
        resourceKind: "draft",
      },
    });
    return success(result, correlationID, 201);
  }),
});

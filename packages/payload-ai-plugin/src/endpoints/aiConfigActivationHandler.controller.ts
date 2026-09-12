/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigActivationHandler.controller.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Переключает immutable config release с hash-bound CAS и durable exact replay.
 */

import {
  parseActivateAIConfigReleaseInput,
  type AIConfigRelease,
} from "@realize/ai-contracts";
import {
  AIConfigurationPolicyError,
  compileAgentConfiguration,
  createActiveAIConfigPointer,
  SYSTEM_AI_CONFIG_PROJECTION,
} from "@realize/change-engine";
import type { PayloadHandler } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireAIConfigurationManager } from "./access";
import {
  configRequestHash,
  configResponseSnapshot,
} from "./aiConfigHandlerSupport";
import {
  parseActiveAIConfigPointerDTO,
  toActiveAIConfigPointerDTO,
} from "./aiConfigPointerMapper";
import { toAIConfigReleaseDTO } from "./aiConfigReleaseMapper";
import { AIConfigRepository } from "./aiConfigRepository";
import { withAIConfigMutationReplay } from "./aiConfigReplay";
import { EndpointError, success } from "./http";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

const requireCompatibleRelease = (release: AIConfigRelease): void => {
  try {
    for (const { artifact } of release.artifacts) {
      if (artifact.kind === "agent_profile" && artifact.enabled) {
        // Компилируется исходный выпуск: его compatibility range нельзя заменять текущим system version.
        compileAgentConfiguration({
          profileKey: artifact.key,
          release,
          system: SYSTEM_AI_CONFIG_PROJECTION,
        });
      }
    }
  } catch (error) {
    if (error instanceof AIConfigurationPolicyError) {
      throw new EndpointError("INVALID_REQUEST", error.message, 400);
    }
    throw error;
  }
};

/** Activate и rollback сохраняют новую версию указателя, не меняя содержимое выпуска или старых запусков. */
export const createAIConfigActivationHandler = (
  options: SanitizedRealizeAIPluginOptions,
): PayloadHandler =>
  withHandler(async (req, correlationID) => {
    const user = await requireAIConfigurationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseActivateAIConfigReleaseInput(await readBody(req));
    const action =
      input.action === "activate" ? "config_activated" : "config_rolled_back";
    const requestHash = configRequestHash(action, input);
    const repository = new AIConfigRepository(req.payload, req);
    const result = await withAIConfigMutationReplay({
      idempotencyKey,
      repository,
      req,
      scope: {
        action,
        actorID: user.id,
        parse: parseActiveAIConfigPointerDTO,
        requestHash,
        resourceID: input.releaseID,
        resourceKind: "release",
      },
      operation: async () => {
        if (
          input.expectedSystemManifestHash !==
          SYSTEM_AI_CONFIG_PROJECTION.manifestHash
        ) {
          throw new EndpointError(
            "CONFLICT",
            "System AI configuration changed. Reload before activation.",
            409,
          );
        }
        const previous = toActiveAIConfigPointerDTO(
          await repository.getActivePointer(),
        );
        if ((previous?.version ?? 0) !== input.expectedPointerVersion) {
          throw new EndpointError(
            "CONFLICT",
            "Active AI configuration changed. Reload before continuing.",
            409,
          );
        }
        const release = toAIConfigReleaseDTO(
          await repository.requireRelease(input.releaseID),
        );
        if (release.manifestHash !== input.expectedReleaseManifestHash) {
          throw new EndpointError(
            "CONFLICT",
            "AI configuration release hash does not match.",
            409,
          );
        }
        if (previous?.releaseID === release.id) {
          throw new EndpointError(
            "CONFLICT",
            "AI configuration release is already active.",
            409,
          );
        }
        if (input.action === "rollback") {
          if (!previous)
            throw new EndpointError(
              "CONFLICT",
              "There is no active AI configuration to roll back.",
              409,
            );
          const current = toAIConfigReleaseDTO(
            await repository.requireRelease(previous.releaseID),
          );
          if (
            current.manifestHash !== previous.manifestHash ||
            release.version >= current.version
          ) {
            throw new EndpointError(
              "CONFLICT",
              "Rollback requires an earlier verified AI configuration release.",
              409,
            );
          }
        }
        requireCompatibleRelease(release);
        const pointer = createActiveAIConfigPointer({
          activatedAt: new Date().toISOString(),
          activatedBy: String(user.id),
          previous: previous ?? undefined,
          release,
        });
        await repository.createActivePointer({
          action: input.action,
          actorID: user.id,
          pointer,
        });
        await repository.recordEvent({
          action,
          actorID: user.id,
          idempotencyKey,
          requestHash,
          resourceID: release.id,
          resourceKind: "release",
          responseSnapshot: configResponseSnapshot(pointer),
          status: "succeeded",
        });
        return pointer;
      },
    });
    return success(result, correlationID);
  });

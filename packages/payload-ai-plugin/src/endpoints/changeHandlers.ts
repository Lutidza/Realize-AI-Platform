/**
 * @file packages/payload-ai-plugin/src/endpoints/changeHandlers.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Реализует создание Change Request и immutable plan decisions.
 */

import {
  parseApprovePlanInput,
  parseCreateChangeRequestInput,
  parseIdentifier,
  parseRejectPlanInput,
} from "@realize/ai-contracts";
import {
  ChangePlanError,
  createPlanApprovalBinding,
  deriveChangePlan,
} from "@realize/change-engine";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import { requireCodexChatTool } from "./requireCodexChatTool.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireChatUser } from "./access";
import { ChangeRepository } from "./changeRepository";
import { projectChangeRequest } from "./changeProjection";
import { DeploymentRepository } from "./deploymentRepository";
import { ExecutionRepository } from "./executionRepository";
import { EndpointError, success } from "./http";
import { redactText } from "./redaction";
import { ReleaseRepository } from "./releaseRepository";
import { SourcePromotionRepository } from "./sourcePromotionRepository";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

const rolesOf = (user: unknown): string[] => {
  const roles = (user as { roles?: unknown } | null)?.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === "string")
    : [];
};

const decisionHandler = (
  options: SanitizedRealizeAIPluginOptions,
  decision: "approved" | "rejected",
): PayloadEndpointHandler =>
  withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    if (decision === "approved")
      await requireCodexChatTool(req, "codeChanges", options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const changeRequestID = parseIdentifier(
      req.routeParams?.id,
      "change request id",
    );
    const body = await readBody(req);
    const input =
      decision === "approved"
        ? parseApprovePlanInput(body)
        : parseRejectPlanInput(body);
    const repository = new ChangeRepository(req.payload, req);
    const executionRepository = new ExecutionRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    let change = await repository.getOwnedChange(changeRequestID, user.id);
    let approval = await repository.getApproval(changeRequestID);

    if (approval) {
      if (approval.decision !== decision) {
        throw new EndpointError(
          "CONFLICT",
          "This plan version already has the opposite decision.",
          409,
        );
      }
      const currentVersion = Number(change.version || 1);
      if (
        currentVersion !== input.expectedVersion &&
        currentVersion !== input.expectedVersion + 1
      ) {
        throw new EndpointError(
          "CONFLICT",
          "The approved plan version no longer matches the request.",
          409,
        );
      }
      if (change.state === "awaiting_plan_approval") {
        change = await repository.updateDecision(
          changeRequestID,
          decision,
          input.comment,
          input.expectedVersion + 1,
        );
      }
      const acceptance = await repository.getApproval(
        changeRequestID,
        "IMPLEMENTATION_ACCEPTANCE",
      );
      return success(
        await projectChangeRequest({
          acceptance,
          approval,
          change,
          deploymentRepository,
          executionRepository,
          options,
          releaseRepository: new ReleaseRepository(req.payload, req),
          sourcePromotionRepository: new SourcePromotionRepository(
            req.payload,
            req,
          ),
        }),
        correlationID,
      );
    }

    if (change.state !== "awaiting_plan_approval") {
      throw new EndpointError(
        "CONFLICT",
        "This Change Request is not awaiting plan approval.",
        409,
      );
    }
    if (Number(change.version) !== input.expectedVersion) {
      throw new EndpointError(
        "CONFLICT",
        "The Change Request version has changed. Reload before deciding.",
        409,
      );
    }
    const expiresAt = String(change.expiresAt || "");
    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
      throw new EndpointError(
        "CONFLICT",
        "This plan approval window has expired.",
        409,
      );
    }

    const actorRoles = rolesOf(user);
    const boundHash = createPlanApprovalBinding({
      actorID: String(user.id),
      actorRoles,
      changeRequestID,
      decision,
      expiresAt,
      planHash: String(change.planHash || ""),
      scopeHash: String(change.scopeHash || ""),
      version: input.expectedVersion,
    });
    const decisionKey = `${changeRequestID}:${input.expectedVersion}:PLAN_APPROVAL`;
    try {
      approval = await repository.createApproval({
        actor: user.id,
        boundHash,
        changeRequestID,
        comment: input.comment,
        decision,
        decisionKey,
        expiresAt,
        idempotencyKey,
        roles: actorRoles,
      });
    } catch (error) {
      approval = await repository.getApproval(changeRequestID);
      if (!approval) throw error;
      if (approval.decision !== decision) {
        throw new EndpointError(
          "CONFLICT",
          "This plan version already has the opposite decision.",
          409,
        );
      }
    }
    change = await repository.updateDecision(
      changeRequestID,
      decision,
      input.comment,
      input.expectedVersion + 1,
    );
    return success(
      await projectChangeRequest({
        approval,
        change,
        deploymentRepository,
        executionRepository,
        options,
        releaseRepository: new ReleaseRepository(req.payload, req),
        sourcePromotionRepository: new SourcePromotionRepository(
          req.payload,
          req,
        ),
      }),
      correlationID,
    );
  });

/** Creates endpoint handlers for plan creation and first approval. */
export const createChangeHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  approve: PayloadEndpointHandler;
  create: PayloadEndpointHandler;
  detail: PayloadEndpointHandler;
  reject: PayloadEndpointHandler;
} => ({
  approve: decisionHandler(options, "approved"),

  create: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    await requireCodexChatTool(req, "codeChanges", options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const conversationID = parseIdentifier(
      req.routeParams?.id,
      "conversation id",
    );
    const input = parseCreateChangeRequestInput(await readBody(req));
    const repository = new ChangeRepository(req.payload, req);
    const executionRepository = new ExecutionRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    const source = await repository.getPlanSource(
      conversationID,
      input.sourceMessageID,
      user.id,
    );
    const existing =
      (await repository.findByIdempotencyKey(user.id, idempotencyKey)) ||
      (await repository.findBySourceMessage(
        conversationID,
        input.sourceMessageID,
      ));
    if (existing) {
      const approval = await repository.getApproval(String(existing.id));
      const acceptance = await repository.getApproval(
        String(existing.id),
        "IMPLEMENTATION_ACCEPTANCE",
      );
      const previewAcceptance = await repository.getApproval(
        String(existing.id),
        "PREVIEW_ACCEPTANCE",
      );
      const releaseApproval = await repository.getApproval(
        String(existing.id),
        "RELEASE_APPROVAL",
      );
      return success(
        await projectChangeRequest({
          acceptance,
          approval,
          change: existing,
          deploymentRepository,
          executionRepository,
          options,
          previewAcceptance,
          releaseApproval,
          releaseRepository: new ReleaseRepository(req.payload, req),
          sourcePromotionRepository: new SourcePromotionRepository(
            req.payload,
            req,
          ),
        }),
        correlationID,
      );
    }

    const plan = redactText(String(source.assistant.content || ""));
    const originalRequest = redactText(
      String(source.originalRequest.content || ""),
    );
    let derived;
    try {
      derived = deriveChangePlan({ originalRequest, plan });
    } catch (error) {
      if (error instanceof ChangePlanError) {
        throw new EndpointError("INVALID_REQUEST", error.message, 400);
      }
      throw error;
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    let change;
    try {
      change = await repository.createChange({
        ...derived,
        conversationID,
        expiresAt,
        idempotencyKey,
        originalRequest,
        plan,
        requestedBy: user.id,
        sourceMessageID: input.sourceMessageID,
      });
    } catch (error) {
      const concurrent =
        (await repository.findByIdempotencyKey(user.id, idempotencyKey)) ||
        (await repository.findBySourceMessage(
          conversationID,
          input.sourceMessageID,
        ));
      if (!concurrent) throw error;
      change = concurrent;
    }
    return success(
      await projectChangeRequest({
        change,
        deploymentRepository,
        executionRepository,
        options,
        releaseRepository: new ReleaseRepository(req.payload, req),
        sourcePromotionRepository: new SourcePromotionRepository(
          req.payload,
          req,
        ),
      }),
      correlationID,
      201,
    );
  }),

  detail: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    const id = parseIdentifier(req.routeParams?.id, "change request id");
    const repository = new ChangeRepository(req.payload, req);
    const executionRepository = new ExecutionRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    const change = await repository.getOwnedChange(id, user.id);
    const approval = await repository.getApproval(id);
    const acceptance = await repository.getApproval(
      id,
      "IMPLEMENTATION_ACCEPTANCE",
    );
    const previewAcceptance = await repository.getApproval(
      id,
      "PREVIEW_ACCEPTANCE",
    );
    const releaseApproval = await repository.getApproval(
      id,
      "RELEASE_APPROVAL",
    );
    return success(
      await projectChangeRequest({
        acceptance,
        approval,
        change,
        deploymentRepository,
        executionRepository,
        options,
        previewAcceptance,
        releaseApproval,
        releaseRepository: new ReleaseRepository(req.payload, req),
        sourcePromotionRepository: new SourcePromotionRepository(
          req.payload,
          req,
        ),
      }),
      correlationID,
    );
  }),

  reject: decisionHandler(options, "rejected"),
});

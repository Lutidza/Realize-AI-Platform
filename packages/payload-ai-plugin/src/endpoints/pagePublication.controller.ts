/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublication.controller.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Регистрирует создание публикации/восстановления и повтор post-commit доставки из админки.
 */
import {
  parseIdentifier,
  parseApplyDataOperationInput,
} from "@realize/ai-contracts";
import type { Endpoint } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DEFAULT_API_ROUTE } from "../constants";
import { requireDataManager, consumeRateLimit } from "./access";
import { requireCodexChatTool } from "./requireCodexChatTool.service";
import { withCodexRuntime } from "./withCodexRuntime.controller";
import { idempotencyKeyFor, readBody, withHandler } from "./request";
import { preparePagePublication } from "./pagePublicationPlanning.service";
import { deliverPagePublication } from "./pagePublicationDelivery.service";
import {
  isPagePublicationKind,
  requirePagePublicationAccess,
} from "./pagePublicationAccess.service";
import { DataOperationRepository } from "./dataOperationRepository";
import { projectDataOperation } from "./dataOperationProjection";
import { EndpointError, success } from "./http";

/** Источником нового плана является только серверная операция; route не принимает raw Pages или произвольный target. */
export const createPagePublicationEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => [
  ...(["publish", "restore"] as const).map((mode) => ({
    method: "post" as const,
    path: `${DEFAULT_API_ROUTE}/data-operations/:id/${mode === "publish" ? "page-publication" : "page-publication-restore"}`,
    handler: withCodexRuntime(options, (runtime) =>
      withHandler(async (req, correlationID) => {
        const user = await requireDataManager(req, runtime);
        if (mode === "publish")
          await requireCodexChatTool(req, "dataOperations", runtime);
        await requirePagePublicationAccess(req);
        consumeRateLimit(user.id);
        const sourceID = parseIdentifier(
          req.routeParams?.id,
          "source operation id",
        );
        const body = await readBody(req);
        const input = parseApplyDataOperationInput(body);
        const operation = await preparePagePublication(
          req,
          sourceID,
          input,
          mode,
          idempotencyKeyFor(req),
        );
        return success(
          await projectDataOperation({ operation, payload: req.payload, req }),
          correlationID,
          201,
        );
      }),
    ),
  })),
  {
    method: "post",
    path: `${DEFAULT_API_ROUTE}/data-operations/:id/page-publication-delivery`,
    handler: withHandler(async (req, correlationID) => {
      const user = await requireDataManager(req, options);
      await requirePagePublicationAccess(req);
      consumeRateLimit(user.id);
      idempotencyKeyFor(req);
      const id = parseIdentifier(
        req.routeParams?.id,
        "publication operation id",
      );
      const input = parseApplyDataOperationInput(await readBody(req));
      const operation = await new DataOperationRepository(
        req.payload,
        req,
      ).getOwnedOperation(id, user.id);
      if (
        !isPagePublicationKind(operation.kind) ||
        operation.state !== "applied" ||
        operation.version !== input.expectedVersion ||
        operation.operationHash !== input.expectedOperationHash
      )
        throw new EndpointError(
          "CONFLICT",
          "Операция изменилась. Обновите карточку перед повтором обновления сайта.",
          409,
        );
      await deliverPagePublication(req, operation);
      return success(
        await projectDataOperation({ operation, payload: req.payload, req }),
        correlationID,
      );
    }),
  },
];

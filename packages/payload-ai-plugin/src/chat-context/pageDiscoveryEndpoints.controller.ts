/**
 * @file packages/payload-ai-plugin/src/chat-context/pageDiscoveryEndpoints.controller.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Принимает узкие server-to-server вызовы инструментов чтения страницы.
 */
import { parseIdentifier, parsePageDiscoveryCall } from "@realize/ai-contracts";
import type { Endpoint } from "payload";
import { DEFAULT_API_ROUTE } from "../constants";
import { EndpointError, success } from "../endpoints/http";
import { readBody, withHandler } from "../endpoints/request";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { authorizePageDiscovery } from "./pageDiscoveryAuthorization.service";
import { executePageDiscovery } from "./pageDiscovery.service";

/** Допуск не входит в query, тело инструмента или публичные результаты. */
export const createPageDiscoveryEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => [
  {
    path: `${DEFAULT_API_ROUTE}/chat/page-tools/:runID`,
    method: "post",
    handler: withHandler(async (req, correlationID) => {
      const runID = parseIdentifier(req.routeParams?.runID, "run id");
      const authorization = req.headers.get("authorization") ?? "";
      if (!authorization.startsWith("Bearer ") || authorization.length > 1_032)
        throw new EndpointError(
          "UNAUTHENTICATED",
          "Требуется допуск запуска к инструментам страницы.",
          401,
        );
      const actor = await authorizePageDiscovery(
        req,
        options,
        runID,
        authorization.slice(7),
      );
      const call = parsePageDiscoveryCall(await readBody(req));
      return success(
        await executePageDiscovery(
          actor.req,
          actor.options,
          runID,
          actor.userID,
          call,
        ),
        correlationID,
      );
    }),
  },
];

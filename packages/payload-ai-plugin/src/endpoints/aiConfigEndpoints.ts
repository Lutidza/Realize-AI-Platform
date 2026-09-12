/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigEndpoints.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Регистрирует bounded installation configuration API surface.
 * @docref Realize AI Commerce v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { Endpoint } from "payload";

import { DEFAULT_API_ROUTE } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createAIChatConfigurationHandler } from "../chat-context/aiChatConfigurationHandler.controller";
import { createAIConfigActivationHandler } from "./aiConfigActivationHandler.controller";
import { createAIConfigDraftHandlers } from "./aiConfigDraftHandlers";
import { createAIConfigReadHandlers } from "./aiConfigReadHandlers";
import { createAIConfigReleaseHandlers } from "./aiConfigReleaseHandlers";

/** Keeps config route composition separate from transport/business handlers. */
export const createAIConfigEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => {
  const drafts = createAIConfigDraftHandlers(options);
  const reads = createAIConfigReadHandlers(options);
  const releases = createAIConfigReleaseHandlers(options);
  const route = `${DEFAULT_API_ROUTE}/config`;

  return [
    { handler: reads.bootstrap, method: "get", path: route },
    {
      handler: createAIChatConfigurationHandler(options),
      method: "get",
      path: `${route}/runtime`,
    },
    {
      handler: createAIConfigActivationHandler(options),
      method: "post",
      path: `${route}/activate`,
    },
    { handler: drafts.create, method: "post", path: `${route}/drafts` },
    { handler: releases.validate, method: "post", path: `${route}/validate` },
    { handler: releases.create, method: "post", path: `${route}/releases` },
    { handler: reads.draft, method: "get", path: `${route}/drafts/:id` },
    { handler: drafts.update, method: "put", path: `${route}/drafts/:id` },
    {
      handler: reads.release,
      method: "get",
      path: `${route}/releases/:id`,
    },
  ];
};

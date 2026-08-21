/**
 * @file packages/payload-ai-plugin/src/index.ts
 * @version 2026-08-21
 * @description Implements the Payload transformer for chat and governed code jobs.
 */

import type { Plugin } from "payload";

import { AI_COLLECTION_SLUGS } from "./constants";
import { createAICollections } from "./collections";
import { createAIEndpoints } from "./endpoints";
import { sanitizeOptions } from "./options";
import type { RealizeAIPluginOptions } from "./types";

export type { RealizeAIPluginOptions } from "./types";

/** Merges gated AI collections, endpoints, global provider and Admin view. */
export const realizeAIPlugin = (
  pluginOptions: RealizeAIPluginOptions,
): Plugin => {
  const options = sanitizeOptions(pluginOptions);

  return (incomingConfig) => {
    const existingCollections = incomingConfig.collections || [];
    const collision = existingCollections.find((collection) =>
      AI_COLLECTION_SLUGS.includes(
        collection.slug as (typeof AI_COLLECTION_SLUGS)[number],
      ),
    );
    if (collision)
      throw new Error(
        `Realize AI collection slug collision: ${collision.slug}`,
      );

    const components = incomingConfig.admin?.components || {};
    const views = components.views || {};
    if (
      Object.values(views).some(
        (view) =>
          view &&
          typeof view === "object" &&
          "path" in view &&
          view.path === options.admin.route,
      )
    ) {
      throw new Error(
        `Realize AI admin route collision: ${options.admin.route}`,
      );
    }

    const endpoints = createAIEndpoints(options);
    for (const endpoint of endpoints) {
      const duplicate = incomingConfig.endpoints?.find(
        (existing) =>
          existing.method === endpoint.method &&
          existing.path === endpoint.path,
      );
      if (duplicate)
        throw new Error(
          `Realize AI endpoint collision: ${endpoint.method} ${endpoint.path}`,
        );
    }

    return {
      ...incomingConfig,
      admin: {
        ...incomingConfig.admin,
        components: {
          ...components,
          providers: [
            ...(components.providers || []),
            {
              clientProps: { route: options.admin.route },
              path: "@realize/payload-ai-control/provider#RealizeAIProvider",
            },
          ],
          beforeNavLinks: [
            ...(components.beforeNavLinks || []),
            {
              clientProps: { route: options.admin.route },
              path: "@realize/payload-ai-control/client#RealizeAINavLink",
            },
          ],
          views: {
            ...views,
            realizeAI: {
              Component: "@realize/payload-ai-control/rsc#RealizeAIView",
              exact: true,
              path: options.admin.route,
            },
          },
        },
      },
      collections: [...existingCollections, ...createAICollections(options)],
      endpoints: [...(incomingConfig.endpoints || []), ...endpoints],
    };
  };
};

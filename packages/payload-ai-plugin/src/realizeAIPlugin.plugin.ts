/**
 * @file packages/payload-ai-plugin/src/realizeAIPlugin.plugin.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Подключает коллекции, endpoints и Admin views плагина Payload.
 */

import type { Plugin } from "payload";

import {
  AI_COLLECTION_SLUGS,
  REALIZE_AI_SERVER_RUNTIME_KEY,
} from "./constants";
import { createAICollections } from "./collections";
import { createAIEndpoints } from "./endpoints";
import { sanitizeOptions } from "./options";
import type { RealizeAIPluginOptions } from "./types";

export type { RealizeAIPluginOptions } from "./types";

/** Сохраняет входную конфигурацию и добавляет защищённые возможности плагина. */
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
    if (incomingConfig.custom?.[REALIZE_AI_SERVER_RUNTIME_KEY] !== undefined) {
      throw new Error(
        `Realize AI config.custom collision: ${REALIZE_AI_SERVER_RUNTIME_KEY}`,
      );
    }

    const components = incomingConfig.admin?.components || {};
    const views = components.views || {};
    const integrationsRoute = options.admin.integrationsRoute;
    const integrationSettingsRoute =
      `${integrationsRoute.replace(/\/$/, "")}/:provider` as `/${string}`;
    for (const route of [
      options.admin.route,
      integrationsRoute,
      integrationSettingsRoute,
    ]) {
      if (
        Object.values(views).some(
          (view) =>
            view &&
            typeof view === "object" &&
            "path" in view &&
            view.path === route,
        )
      ) {
        throw new Error(`Realize Admin route collision: ${route}`);
      }
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
              clientProps: {
                group: options.admin.group,
                integrationsRoute: options.admin.integrationsRoute,
                route: options.admin.route,
              },
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
            realizeIntegrations: {
              Component: {
                path: "@realize/payload-ai-control/integrations-rsc#IntegrationsView",
                serverProps: { integrationsRoute, mode: "catalog" },
              },
              exact: true,
              path: integrationsRoute,
            },
            realizeIntegrationSettings: {
              Component: {
                path: "@realize/payload-ai-control/integrations-rsc#IntegrationsView",
                serverProps: { integrationsRoute, mode: "settings" },
              },
              exact: true,
              path: integrationSettingsRoute,
            },
          },
        },
      },
      collections: [...existingCollections, ...createAICollections(options)],
      custom: {
        ...(incomingConfig.custom || {}),
        [REALIZE_AI_SERVER_RUNTIME_KEY]: {
          canManageAIConfiguration: options.access.canManageAIConfiguration,
          canManageIntegrations: options.access.canManageIntegrations,
          integrationEncryptionKeyEnv: options.integrations.encryptionKeyEnv,
        },
      },
      endpoints: [...(incomingConfig.endpoints || []), ...endpoints],
    };
  };
};

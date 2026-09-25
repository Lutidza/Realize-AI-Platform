/**
 * @file packages/payload-ai-plugin/src/realizeAIPlugin.plugin.ts
 * @version 1.7.0
 * @date 2026-09-24
 * @description Подключает коллекции, endpoints и Admin views плагина Payload.
 */

import type { Plugin } from "payload";

import {
  AI_COLLECTION_SLUGS,
  REALIZE_AI_SERVER_RUNTIME_KEY,
} from "./constants";
import { createAICollections } from "./collections";
import { createAIEndpoints } from "./endpoints";
import { lockPageDraftWrites } from "./endpoints/lockPageDraftWrites.hook";
import { sanitizeOptions } from "./options";
import { installMcpPresetsAfterLogin } from "./integrations/mcp/installMcpPresetsAfterLogin.hook";
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
    const conflictingView = [
      "realizeAgentLayerSettings",
      "realizeWorkflowRuns",
      "realizeWorkflowRun",
      "realizeMcpServers",
      "realizeMcpServer",
    ].find((key) => key in views);
    if (conflictingView) {
      throw new Error(`Realize Admin view key collision: ${conflictingView}`);
    }
    const integrationsRoute = options.admin.integrationsRoute;
    const mcpServersRoute = options.admin.mcpServersRoute;
    const mcpServerRoute = `${mcpServersRoute}/:serverID` as `/${string}`;
    const integrationSettingsRoute =
      `${integrationsRoute.replace(/\/$/, "")}/:provider` as `/${string}`;
    const chatWindowRoute =
      `${options.admin.route.replace(/\/$/, "")}/window` as `/${string}`;
    const agentLayerRoute =
      `${options.admin.route.replace(/\/$/, "")}/settings` as `/${string}`;
    const workflowRunsRoute =
      `${options.admin.route.replace(/\/$/, "")}/runs` as `/${string}`;
    const workflowRunRoute = `${workflowRunsRoute}/:rootRunID` as `/${string}`;
    const registeredRoutes = new Set<string>();
    for (const route of [
      options.admin.route,
      chatWindowRoute,
      agentLayerRoute,
      workflowRunsRoute,
      workflowRunRoute,
      integrationsRoute,
      integrationSettingsRoute,
      mcpServersRoute,
      mcpServerRoute,
    ]) {
      const normalizedRoute = route.replace(/\/$/, "");
      if (
        registeredRoutes.has(normalizedRoute) ||
        Object.values(views).some(
          (view) =>
            view &&
            typeof view === "object" &&
            "path" in view &&
            typeof view.path === "string" &&
            view.path.replace(/\/$/, "") === normalizedRoute,
        )
      ) {
        throw new Error(`Realize Admin route collision: ${route}`);
      }
      registeredRoutes.add(normalizedRoute);
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
              clientProps: { route: options.admin.route, integrationsRoute },
              path: "@realize/payload-ai-control/provider#RealizeAIProvider",
            },
          ],
          beforeNavLinks: [
            ...(components.beforeNavLinks || []),
            {
              clientProps: {
                group: options.admin.group,
                integrationsRoute: options.admin.integrationsRoute,
                mcpServersRoute,
                route: options.admin.route,
              },
              path: "@realize/payload-ai-control/client#RealizeAINavLink",
            },
          ],
          views: {
            ...views,
            realizeMcpServers: {
              Component: {
                path: "@realize/payload-ai-control/mcp-servers-rsc#McpServersView",
                serverProps: { mcpServersRoute, mode: "list" },
              },
              exact: true,
              path: mcpServersRoute,
            },
            realizeMcpServer: {
              Component: {
                path: "@realize/payload-ai-control/mcp-servers-rsc#McpServersView",
                serverProps: { mcpServersRoute, mode: "detail" },
              },
              exact: true,
              path: mcpServerRoute,
            },
            realizeAI: {
              Component: "@realize/payload-ai-control/rsc#RealizeAIView",
              exact: true,
              path: options.admin.route,
            },
            realizeAIWindow: {
              Component: {
                path: "@realize/payload-ai-control/rsc#RealizeAIView",
                serverProps: { presentation: "window" },
              },
              exact: true,
              path: chatWindowRoute,
            },
            realizeWorkflowRuns: {
              Component: {
                path: "@realize/payload-ai-control/workflow-runs-rsc#WorkflowRunsView",
                serverProps: {
                  runsRoute: workflowRunsRoute,
                  chatRoute: options.admin.route,
                  settingsRoute: agentLayerRoute,
                  mode: "list",
                },
              },
              exact: true,
              path: workflowRunsRoute,
            },
            realizeWorkflowRun: {
              Component: {
                path: "@realize/payload-ai-control/workflow-runs-rsc#WorkflowRunsView",
                serverProps: {
                  runsRoute: workflowRunsRoute,
                  chatRoute: options.admin.route,
                  settingsRoute: agentLayerRoute,
                  mode: "detail",
                },
              },
              exact: true,
              path: workflowRunRoute,
            },
            realizeIntegrations: {
              Component: {
                path: "@realize/payload-ai-control/integrations-rsc#IntegrationsView",
                serverProps: { integrationsRoute, mode: "catalog" },
              },
              exact: true,
              path: integrationsRoute,
            },
            realizeAgentLayerSettings: {
              Component: {
                path: "@realize/payload-ai-control/agent-layer-rsc#AgentLayerView",
                serverProps: { settingsRoute: agentLayerRoute },
              },
              exact: true,
              path: agentLayerRoute,
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
      collections: [
        ...existingCollections.map((collection) =>
          collection.slug === options.userCollection && collection.auth
            ? {
                ...collection,
                hooks: {
                  ...collection.hooks,
                  afterLogin: [
                    ...(collection.hooks?.afterLogin || []),
                    installMcpPresetsAfterLogin(options),
                  ],
                },
              }
            : collection.slug === "pages" && options.pageDraft
              ? {
                  ...collection,
                  hooks: {
                    ...collection.hooks,
                    beforeOperation: [
                      lockPageDraftWrites,
                      ...(collection.hooks?.beforeOperation || []),
                    ],
                  },
                }
              : collection,
        ),
        ...createAICollections(options),
      ],
      custom: {
        ...(incomingConfig.custom || {}),
        [REALIZE_AI_SERVER_RUNTIME_KEY]: {
          userCollection: options.userCollection,
          pageDraft: options.pageDraft,
          canUseChat: options.access.canUseChat,
          canManageData: options.access.canManageData,
          canManageAIConfiguration: options.access.canManageAIConfiguration,
          canManageIntegrations: options.access.canManageIntegrations,
          integrationEncryptionKeyEnv: options.integrations.encryptionKeyEnv,
        },
      },
      endpoints: [...(incomingConfig.endpoints || []), ...endpoints],
    };
  };
};

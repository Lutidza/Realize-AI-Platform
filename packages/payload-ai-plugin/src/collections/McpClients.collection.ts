/**
 * @file packages/payload-ai-plugin/src/collections/McpClients.collection.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Хранит необратимые verifiers входящих MCP клиентов отдельно от outbound vault.
 */
import type { CollectionConfig } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";
export const MCP_CLIENTS_SLUG = "ai-mcp-clients";
export function createMcpClientsCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: MCP_CLIENTS_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    versions: false,
    timestamps: true,
    fields: [
      { name: "serverID", type: "text", required: true, index: true },
      { name: "clientID", type: "text", required: true, unique: true },
      { name: "principalID", type: "text", required: true, unique: true },
      { name: "displayName", type: "text", required: true },
      { name: "verifier", type: "text", required: true },
      { name: "grants", type: "json", required: true },
      {
        name: "actor",
        type: "relationship",
        relationTo: options.userCollection,
      },
      {
        name: "createdBy",
        type: "relationship",
        relationTo: options.userCollection,
        required: true,
      },
      { name: "expiresAt", type: "date", required: true },
      { name: "revokedAt", type: "date" },
      {
        name: "revision",
        type: "number",
        required: true,
        min: 1,
        defaultValue: 1,
      },
    ],
  };
}

/**
 * @file packages/payload-ai-plugin/src/collections/McpRuntimeReceipts.collection.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Хранит подтверждённую конфигурацию и boot identity MCP без фиктивного пользователя.
 */
import type { CollectionConfig } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";
export const MCP_RUNTIME_SLUG = "ai-mcp-runtime-receipts";
export function createMcpRuntimeReceiptsCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: MCP_RUNTIME_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    versions: false,
    timestamps: true,
    fields: [
      { name: "serverID", type: "text", required: true, unique: true },
      { name: "hostProfileID", type: "text" },
      { name: "bootID", type: "text" },
      { name: "serviceIdentity", type: "text" },
      { name: "requestedRevision", type: "number" },
      { name: "appliedRevision", type: "number" },
      { name: "configHash", type: "text" },
      { name: "appliedSnapshot", type: "json" },
      { name: "discoveredTools", type: "json" },
      { name: "discoveredRevision", type: "number" },
      { name: "chatgptTunnel", type: "json" },
      { name: "observedAt", type: "date" },
      {
        name: "status",
        type: "select",
        options: [
          "unknown",
          "pending",
          "applying",
          "applied",
          "restart_required",
          "failed",
        ],
        required: true,
        defaultValue: "unknown",
      },
      { name: "reason", type: "text" },
    ],
  };
}

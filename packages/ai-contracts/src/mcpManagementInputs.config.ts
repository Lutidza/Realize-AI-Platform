/**
 * @file packages/ai-contracts/src/mcpManagementInputs.config.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Валидирует management inputs MCP по типу adapter и версии конфигурации.
 */
import { z } from "zod";
import { MCP_REALIZE_TOOLS } from "./mcpServer.config";
const label = z.string().trim().min(1).max(120);
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const tunnelID = z
  .string()
  .trim()
  .regex(/^tunnel_[A-Za-z0-9_-]{8,128}$/);
const grants = z.strictObject({
  repositoryRead: z.boolean(),
  pagesRead: z.boolean(),
});
export const mcpLimitsSchema = z.strictObject({
  callsPerMinute: z.number().int().min(1).max(60),
  burst: z.number().int().min(1).max(10),
  concurrentCalls: z.number().int().min(1).max(4),
  responseBytes: z.number().int().min(8192).max(131072),
});
const common = {
  schemaVersion: z.literal("1.0"),
  adapterVersion: z.literal("1.0"),
  environment: label,
};
export const mcpConfigurationSchema = z.union([
  z.strictObject({
    ...common,
    serverType: z.literal("realize-internal"),
    direction: z.literal("hosted_endpoint"),
    managementSource: z.literal("admin_managed"),
    hostProfileID: identifier,
    port: z.number().int().min(1024).max(65535),
    allowedTools: z
      .array(z.enum(MCP_REALIZE_TOOLS))
      .max(MCP_REALIZE_TOOLS.length)
      .refine((tools) => tools.length === new Set(tools).size),
    limits: mcpLimitsSchema,
    chatgptTunnel: z.strictObject({ tunnelID, clientID: z.uuid() }).optional(),
  }),
  z.strictObject({
    ...common,
    serverType: z.literal("mcp-http"),
    direction: z.literal("external_connection"),
    managementSource: z.literal("admin_managed"),
    hostProfileID: identifier,
    endpoint: z.string().url().max(2048),
    authentication: z.enum(["none", "bearer"]),
    reviewedTools: z
      .array(
        z.strictObject({
          name: z.string().max(128),
          schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .max(100),
    limits: mcpLimitsSchema,
  }),
  z.strictObject({
    ...common,
    serverType: z.enum(["nextjs", "payload"]),
    direction: z.literal("external_connection"),
    managementSource: z.enum(["operator_managed", "client_managed"]),
    profileReference: identifier,
  }),
]);
const expectedRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const server = {
  displayName: label,
  configuration: mcpConfigurationSchema,
  credential: z.string().min(1).max(8192).optional(),
};
export const mcpManagementInputs = {
  create: z.strictObject(server),
  update: z.strictObject({ ...server, expectedRevision }),
  revision: z.strictObject({ expectedRevision }),
  enabled: z.strictObject({ expectedRevision, enabled: z.boolean() }),
  chatgpt: z.strictObject({
    expectedRevision,
    tunnelID,
    apiKey: z
      .string()
      .trim()
      .min(16)
      .max(2048)
      .regex(/^sk-[A-Za-z0-9_-]+$/)
      .optional(),
    grants,
    expiresAt: z.iso.datetime(),
  }),
  issueClient: z.strictObject({
    expectedRevision,
    displayName: label,
    grants,
    actorBinding: z.enum(["self", "none"]),
    expiresAt: z.iso.datetime(),
  }),
  list: z.strictObject({
    q: z.string().trim().max(128).default(""),
    page: z.coerce.number().int().min(1).max(999999).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    serverType: z
      .enum(["realize-internal", "mcp-http", "nextjs", "payload"])
      .optional(),
    environment: z.string().max(120).optional(),
    enabled: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  }),
};

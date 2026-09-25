/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/readMcpHostProfiles.config.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Читает доверенные host ceilings отдельно от конфигурации, редактируемой в Admin.
 */
import { isAbsolute } from "node:path";
import { z } from "zod";
import { mcpLimitsSchema } from "../../../../ai-contracts/src/mcpManagementInputs.config";
import { MCP_DEFAULT_LIMITS } from "../../../../ai-contracts/src/mcpServer.config";
import type { McpHostProfile } from "./McpHostProfile.types";
import type { McpHostProfileDto } from "../../../../ai-contracts/src/McpServer.types";
import { EndpointError } from "../../endpoints/http";

const profilesSchema = z
  .array(
    z.strictObject({
      id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
      label: z.string().min(1).max(120),
      repositoryRoot: z.string().refine(isAbsolute).nullable().default(null),
      repositoryServerIDs: z.array(z.uuid()).max(100).default([]),
      allowedPorts: z
        .array(z.number().int().min(1024).max(65535))
        .min(1)
        .max(32),
      pagesRead: z.boolean().default(false),
      controlTokenEnv: z.string().regex(/^REALIZE_MCP_CONTROL_[A-Z0-9_]+$/),
      maximumLimits: mcpLimitsSchema.default({ ...MCP_DEFAULT_LIMITS }),
      tunnelClientPath: z.string().max(4096).refine(isAbsolute).optional(),
    }),
  )
  .max(16);

/** Отсутствующие trust anchors закрывают действия, а не создают неявный development grant. */
export function readMcpHostProfiles(
  env: NodeJS.ProcessEnv = process.env,
): McpHostProfile[] {
  const raw = env.REALIZE_MCP_HOST_PROFILES;
  if (!raw) return [];
  try {
    if (raw.length > 32768) throw new Error();
    const profiles = profilesSchema.parse(JSON.parse(raw));
    if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length)
      throw new Error();
    return profiles;
  } catch {
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Operator host profiles MCP требуют исправления.",
      503,
    );
  }
}

export function mapMcpHostProfile(profile: McpHostProfile): McpHostProfileDto {
  const ready = /^[A-Za-z0-9_-]{43,}$/.test(
    process.env[profile.controlTokenEnv] ?? "",
  );
  return {
    id: profile.id,
    label: profile.label,
    serverTypes: ["realize-internal"],
    allowedPorts: [...profile.allowedPorts],
    repositoryGrantAllowed:
      profile.repositoryServerIDs.length > 0 && profile.repositoryRoot !== null,
    pagesGrantAllowed: profile.pagesRead,
    maximumLimits: { ...profile.maximumLimits },
    reason: ready
      ? null
      : "Оператор должен настроить credential управляющего процесса.",
  };
}

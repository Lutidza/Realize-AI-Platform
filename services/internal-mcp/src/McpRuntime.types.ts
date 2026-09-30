/**
 * @file services/internal-mcp/src/McpRuntime.types.ts
 * @version 1.2.0
 * @date 2026-09-27
 * @description Описывает доверенные порты авторизации и предметного чтения MCP listener.
 */
import type {
  McpWorkshopIdentity,
  McpWorkshopToolName,
  SearchObservation,
} from "@realize/ai-contracts";
import type { McpLimits } from "../../../packages/ai-contracts/src/McpServer.types";
import type {
  McpToolInput,
  McpToolName,
} from "../../../packages/ai-contracts/src/McpTool.types";
import type { RepositoryReadPolicy } from "../../ai-control-plane/src/RepositoryRead.types";
export type McpPrincipal = {
  principalID: string;
  installationID: string;
  repositoryRead: boolean;
  pagesRead: boolean;
  workshopRead?: boolean;
  workshopWrite?: boolean;
  workshopPreview?: boolean;
  workshopIdentity?: McpWorkshopIdentity;
  payloadUserID?: string;
  discoveryOnly?: boolean;
  allowedTools: McpToolName[];
  limits: McpLimits;
};
export type McpPagesPort = {
  execute: (
    principal: McpPrincipal,
    name: "pages_list" | "pages_get" | "pages_get_structure",
    input: McpToolInput<"pages_list" | "pages_get" | "pages_get_structure">,
    signal: AbortSignal,
  ) => Promise<unknown>;
  close: () => Promise<void>;
};
export type McpRuntimeOptions = {
  port: number;
  policy?: RepositoryReadPolicy;
  authorize: (credential: string) => Promise<McpPrincipal>;
  pages?: McpPagesPort;
  workshop?: {
    execute: (
      principal: McpPrincipal,
      name: McpWorkshopToolName,
      input: unknown,
      signal: AbortSignal,
    ) => Promise<unknown>;
  };
  close?: () => Promise<void>;
  observeSearch?: (event: SearchObservation) => void;
  log?: (event: {
    requestID: string;
    tool: string;
    code: string;
    durationMs: number;
    bytes: number;
  }) => void;
};

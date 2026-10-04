/**
 * @file services/internal-mcp/src/McpRuntime.types.ts
 * @version 1.3.0
 * @date 2026-09-30
 * @description Описывает доверенные порты авторизации и предметного чтения MCP listener.
 */
import type {
  McpWorkshopIdentity,
  McpWorkshopToolName,
  SearchObservation,
  AgentReadTools,
} from "@realize/ai-contracts";
import type { McpLimits } from "../../../packages/ai-contracts/src/McpServer.types";
import type {
  McpToolInput,
  McpToolName,
} from "../../../packages/ai-contracts/src/McpTool.types";
import type { RepositoryReadPolicy } from "../../ai-control-plane/src/RepositoryRead.types";
export type McpPrincipal = {
  principalID: string;
  /** Назначение managed credential определяется сервером; оно не доказывает внешний UI-прогон. */
  consumer?: "chatgpt" | "mcp";
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
  /** Только server-owned facade изолированного run; регистрация ограничена его repo_* definitions. */
  repositoryTools?: AgentReadTools;
  sourceVersion?: string;
  installedBuildID?: string;
  /** Доверенный origin Payload установки для hash-bound source links; не принимается от MCP клиента. */
  repositorySourceURLBase?: string;
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

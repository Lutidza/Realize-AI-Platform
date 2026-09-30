/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServersClient.types.ts
 * @version 1.3.0
 * @date 2026-09-26
 * @description Описывает состояние каталога и формы управления MCP без server-only данных.
 */
import type {
  CreateMcpServerInput,
  McpHostProfileDto,
  McpServerDescriptorDto,
  McpServerPresetDto,
  McpServerDetailDto,
  SaveMcpChatGptInput,
  McpClientGrants,
} from "@realize/ai-contracts";

export type McpCatalog = {
  descriptors: McpServerDescriptorDto[];
  profiles: McpHostProfileDto[];
  presets: McpServerPresetDto[];
};
export type McpChatGptConnectionProps = {
  server: McpServerDetailDto;
  busy: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (input: SaveMcpChatGptInput) => Promise<void>;
  onDisconnect: () => Promise<void>;
};
export type McpGrantFieldsProps = {
  value: McpClientGrants;
  allowed: McpClientGrants;
  onChange: (value: McpClientGrants) => void;
};
export type McpFormProps = {
  initial: CreateMcpServerInput;
  profiles: McpHostProfileDto[];
  busy: boolean;
  existing?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (input: CreateMcpServerInput) => Promise<void>;
};

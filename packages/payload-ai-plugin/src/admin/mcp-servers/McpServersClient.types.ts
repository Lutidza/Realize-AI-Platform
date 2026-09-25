/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServersClient.types.ts
 * @version 1.2.0
 * @date 2026-09-25
 * @description Описывает состояние каталога и формы управления MCP без server-only данных.
 */
import type {
  CreateMcpServerInput,
  McpHostProfileDto,
  McpServerDescriptorDto,
  McpServerPresetDto,
  McpServerDetailDto,
  SaveMcpChatGptInput,
  McpReadGrants,
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
export type McpReadGrantFieldsProps = {
  value: McpReadGrants;
  allowed: McpReadGrants;
  onChange: (value: McpReadGrants) => void;
};
export type McpFormProps = {
  initial: CreateMcpServerInput;
  profiles: McpHostProfileDto[];
  busy: boolean;
  existing?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (input: CreateMcpServerInput) => Promise<void>;
};

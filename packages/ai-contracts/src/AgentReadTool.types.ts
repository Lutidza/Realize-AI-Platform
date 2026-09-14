/**
 * @file packages/ai-contracts/src/AgentReadTool.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Определяет server-owned инструменты чтения без передачи функций через публичный API.
 */
/** Определения и callback задаёт код сервера; пользовательский run не регистрирует инструменты. */
export type AgentReadToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AgentReadTools = {
  definitions: readonly AgentReadToolDefinition[];
  execute: (call: {
    name: string;
    arguments: unknown;
    callID: string;
  }) => Promise<unknown>;
};

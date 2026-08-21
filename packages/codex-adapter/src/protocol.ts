/**
 * @file packages/codex-adapter/src/protocol.ts
 * @version 2026-08-17
 * @description Defines the narrow protocol projection used from the Codex App Server schema.
 */

export type JSONRPCID = number | string;

export type RPCMessage = {
  error?: {
    code?: number;
    message?: string;
  };
  id?: JSONRPCID;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
};

export type ThreadStartResult = {
  model: string;
  thread: {
    id: string;
  };
};

export type TurnStartResult = {
  turn: {
    id: string;
  };
};

export type TokenUsage = {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

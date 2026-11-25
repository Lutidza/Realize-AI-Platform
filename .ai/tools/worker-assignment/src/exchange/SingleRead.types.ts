/**
 * @file .ai/tools/worker-assignment/src/exchange/SingleRead.types.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Описывает корреляцию сообщений имитатора и доказательства чтения для ревьюера.
 * @see documentation/architecture/assignment-adapter/single-read.md
 */
import type { McpToolInput } from "../../../../../packages/ai-contracts/src/McpTool.types";
import type { AssignmentReadReceipt } from "../AssignmentTransport.types";
import type { AuditAssistantCall } from "./singleReadMessages.schemas";

export type AuditCallKey = {
  attemptId: string;
  requestId: string;
  toolCallId: string;
  argumentsSha256: string;
};
export type AuditContinuation = {
  key: AuditCallKey;
  assistant: AuditAssistantCall;
  result: { role: "tool"; tool_call_id: string; content: string };
};
export type AuditOperation = {
  key: AuditCallKey;
  name: string;
  arguments: McpToolInput<"repo_read_file"> | null;
  expectedSha256: string | null;
  outcome: "read" | "denied";
  receipt: (AssignmentReadReceipt & { truncated: boolean }) | null;
  code: "FORBIDDEN" | null;
};
type ExchangeIdentity = { attemptId: string; requestId: string };
/** Корреляцию устанавливает транспорт при вызове. Поля сообщения провайдера находятся в body. */
export interface SingleReadTransport {
  send(
    request: ExchangeIdentity & { body: string },
  ): Promise<ExchangeIdentity & { body: unknown }>;
}

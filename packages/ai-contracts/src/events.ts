/**
 * @file packages/ai-contracts/src/events.ts
 * @version 2026-08-17
 * @description Defines the resumable SSE contract shared by control plane, site and browser.
 */

/** Event kinds supported by the current resumable browser stream. */
export type AIStreamEventType =
  | "assistant.completed"
  | "assistant.delta"
  | "run.cancelled"
  | "run.failed"
  | "run.started"
  | "tool.completed"
  | "tool.started"
  | "usage.updated";

/** Persistable SSE event with a monotonically increasing run-local sequence. */
export type AIStreamEvent = {
  changeRequestID?: string;
  createdAt: string;
  id: string;
  payload: Record<string, unknown>;
  runID: string;
  sequence: number;
  type: AIStreamEventType;
  visibility: "internal-summary" | "redacted" | "user-visible";
};

/** Encodes one validated event as a standards-compatible SSE frame. */
export const encodeSSE = (event: AIStreamEvent): string => {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
};

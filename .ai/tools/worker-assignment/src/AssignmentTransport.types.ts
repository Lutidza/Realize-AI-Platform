/**
 * @file .ai/tools/worker-assignment/src/AssignmentTransport.types.ts
 * @version 2.0.0
 * @date 2026-11-25
 * @description Определяет передачу назначения в сессию и события одного хода.
 */
import type { readRepositoryLines } from "../../../../services/ai-control-plane/src/readRepositoryLines.service";
import type {
  AccessBinding,
  AdmissionAttempt,
  AdmissionAuthority,
  BoundAssignment,
} from "./admission/AssignmentAdmission.types";

type ReadResult = Awaited<ReturnType<typeof readRepositoryLines>>;
export type AssignmentReadReceipt = Pick<
  ReadResult,
  "path" | "startLine" | "endLine"
> & {
  sha256: string;
};
export type AssignmentTurn = { threadId: string; turnId: string };
export type AssignmentToolRequest = AssignmentTurn & {
  type: "tool";
  callId: string;
  name: string;
  args: unknown;
};
export type AssignmentEvent =
  | AssignmentToolRequest
  | (AssignmentTurn & { type: "completed"; output: string });
export type AssignmentToolReply =
  { ok: true; read: ReadResult } | { ok: false; code: string };

/** open получает только метаданные. startTurn проверяет привязку при передаче и возвращает null при её утрате. */
export interface AssignmentTransport {
  open(
    expected: BoundAssignment["report"],
    attempt: AdmissionAttempt,
  ): Promise<{
    threadId: string;
    evidence: unknown;
    authority: AdmissionAuthority;
  }>;
  startTurn(
    threadId: string,
    initialInput: string,
    attemptId: string,
    binding: AccessBinding,
  ): Promise<AssignmentTurn | null>;
  events(): AsyncIterable<AssignmentEvent>;
  reply(
    request: AssignmentToolRequest,
    result: AssignmentToolReply,
  ): Promise<void>;
  close(): Promise<void>;
}

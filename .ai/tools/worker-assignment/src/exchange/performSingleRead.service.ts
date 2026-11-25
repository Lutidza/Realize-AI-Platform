/**
 * @file .ai/tools/worker-assignment/src/exchange/performSingleRead.service.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Связывает результат штатного reader с вызовом и сохраняет фактический диапазон для ревью.
 * @see documentation/architecture/assignment-adapter/single-read.md
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { createHash } from "node:crypto";
import { mcpToolInputs } from "@realize/ai-contracts";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import type { BoundAssignment } from "../admission/AssignmentAdmission.types";
import type {
  AuditCallKey,
  AuditContinuation,
  AuditOperation,
} from "./SingleRead.types";
import type { AuditAssistantCall } from "./singleReadMessages.schemas";

// Квитанция подтверждает байты reader и исходный вызов. Сериализованная копия полномочий не даёт.
const witnessed = new WeakMap<
  AuditContinuation,
  { contextId: string; lockSha256: string; digest: string }
>();
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Один и тот же ключ связывает открытый вызов, результат reader и контрольную точку. */
export function createAuditCallKey(
  attemptId: string,
  requestId: string,
  assistant: AuditAssistantCall,
): AuditCallKey {
  const call = assistant.tool_calls[0];
  return {
    attemptId,
    requestId,
    toolCallId: call.id,
    argumentsSha256: digest([call.function.name, call.function.arguments]),
  };
}

export function matchesReadReceipt(
  bound: BoundAssignment,
  continuation: AuditContinuation,
) {
  const proof = witnessed.get(continuation);
  return (
    proof?.contextId === bound.report.contextId &&
    proof.lockSha256 === bound.report.lockSha256 &&
    proof.digest === digest(continuation)
  );
}

/** Текст возвращается только в контексте продолжения. Квитанция хранит метаданные фактического чтения. */
export async function performSingleRead(
  bound: BoundAssignment,
  attemptId: string,
  requestId: string,
  assistant: AuditAssistantCall,
) {
  const call = assistant.tool_calls[0];
  const { name, arguments: raw } = call.function;
  const key = createAuditCallKey(attemptId, requestId, assistant);
  const args =
    name === "repo_read_file"
      ? mcpToolInputs.repo_read_file.parse(JSON.parse(raw))
      : null;
  const expectedSha256 =
    args && Object.hasOwn(bound.context.readPins, args.path)
      ? bound.context.readPins[args.path]
      : null;
  let operation: AuditOperation;
  let content: string;
  try {
    const read = await bound.context.callTool(name, args);
    if (
      !args ||
      read.path !== args.path ||
      read.version.sha256 !== expectedSha256
    )
      throw new RepositoryReadError(
        "CONFLICT",
        "Версия или путь результата изменились.",
      );
    const receipt = {
      path: read.path,
      startLine: read.startLine,
      endLine: read.endLine,
      truncated: read.truncated,
      sha256: read.version.sha256,
    };
    operation = {
      key,
      name,
      arguments: args,
      expectedSha256,
      outcome: "read",
      receipt,
      code: null,
    };
    content = JSON.stringify({ ...receipt, text: read.text });
  } catch (error) {
    if (!(error instanceof RepositoryReadError) || error.code !== "FORBIDDEN")
      throw error;
    operation = {
      key,
      name,
      arguments: args,
      expectedSha256,
      outcome: "denied",
      receipt: null,
      code: "FORBIDDEN",
    };
    content = JSON.stringify({ code: "FORBIDDEN" });
  }
  const continuation: AuditContinuation = {
    key,
    assistant,
    result: { role: "tool", tool_call_id: call.id, content },
  };
  witnessed.set(continuation, {
    contextId: bound.report.contextId,
    lockSha256: bound.report.lockSha256,
    digest: digest(continuation),
  });
  return { operation, continuation };
}

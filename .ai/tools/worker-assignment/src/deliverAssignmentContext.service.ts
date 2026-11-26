/**
 * @file .ai/tools/worker-assignment/src/deliverAssignmentContext.service.ts
 * @version 2.0.1
 * @date 2026-11-26
 * @description Передаёт проверенный ввод и связывает чтения и ответ с одним ходом транспорта.
 */
import { randomUUID } from "node:crypto";
import { RepositoryReadError } from "../../../../services/ai-control-plane/src/RepositoryRead.error";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import type {
  AssignmentReadReceipt,
  AssignmentTransport,
  AssignmentTurn,
  AssignmentToolReply,
} from "./AssignmentTransport.types";
import { assessAdapterAdmission } from "./admission/assessAdapterAdmission.validator";
import type { AdmissionTarget } from "./admission/AssignmentAdmission.types";
import { bindAssignment } from "./bindAssignment.service";

/** Полученный ответ адресован оркестратору. Решение по существу аудита принимается после ревью. */
export async function deliverAssignmentContext(
  policy: RepositoryReadPolicy,
  lockPath: string,
  contextId: string,
  transport: AssignmentTransport,
  selectedTarget: AdmissionTarget,
) {
  if (!contextId)
    throw new Error(
      "Для передачи требуется идентификатор сохранённого контекста.",
    );
  const bound = await bindAssignment(policy, lockPath, contextId);
  if (!bound.context) return bound.report;
  const { assignmentId, revision, lockSha256 } = bound.report;
  const identity = { contextId, assignmentId, revision, lockSha256 };
  const reads: AssignmentReadReceipt[] = [];
  let turn: AssignmentTurn | undefined;
  const blocked = (code: string, reason: string) => ({
    ...identity,
    ...turn,
    status: "blocked" as const,
    issues: [{ code, reason }],
    reads,
  });
  try {
    const attempt = {
      attemptId: randomUUID(),
      bindingKind: "session",
      target: structuredClone(selectedTarget),
    } as const;
    const thread = await transport.open(
      structuredClone(bound.report),
      structuredClone(attempt),
    );
    if (!thread.threadId)
      return blocked("turn_mismatch", "Идентификатор сессии отсутствует.");
    const decision = assessAdapterAdmission(
      bound.report,
      attempt,
      thread.evidence,
      thread.authority,
    );
    if (decision.status === "blocked")
      return { ...identity, ...decision, reads };
    const started = await transport.startTurn(
      thread.threadId,
      bound.context.initialInput,
      attempt.attemptId,
      decision.binding,
    );
    if (!started)
      return blocked(
        "binding_unavailable",
        "Сессия изменилась до передачи ввода.",
      );
    if (started.threadId !== thread.threadId || !started.turnId)
      return blocked("turn_mismatch", "Ход не привязан к открытой сессии.");
    turn = { threadId: thread.threadId, turnId: started.turnId };
    for await (const event of transport.events()) {
      if (event.threadId !== turn.threadId || event.turnId !== turn.turnId)
        return blocked(
          "turn_mismatch",
          "Событие относится к другой сессии или ходу.",
        );
      if (event.type === "completed" && event.output.trim())
        return {
          ...identity,
          ...turn,
          status: "received" as const,
          output: event.output,
          reads,
        };
      if (event.type !== "tool")
        return blocked(
          "result_missing",
          "Транспорт не вернул содержательного финального сообщения.",
        );
      let reply: AssignmentToolReply;
      try {
        const read = await bound.context.callTool(event.name, event.args);
        reply = { ok: true, read };
      } catch (error) {
        if (!(error instanceof RepositoryReadError)) throw error;
        reply = { ok: false, code: error.code };
      }
      await transport.reply(event, reply);
      if (reply.ok) {
        const { path, startLine, endLine, version } = reply.read;
        reads.push({ path, startLine, endLine, sha256: version.sha256 });
      }
    }
    return blocked(
      "result_missing",
      "Поток закрылся до финального сообщения этого хода.",
    );
  } finally {
    await transport.close();
  }
}

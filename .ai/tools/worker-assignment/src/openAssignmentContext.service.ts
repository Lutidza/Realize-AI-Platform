/**
 * @file .ai/tools/worker-assignment/src/openAssignmentContext.service.ts
 * @version 1.2.1
 * @date 2026-11-26
 * @description Допускает доступ к сохранённому вводу и обработчику чтения после проверки привязки.
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { AssignmentContextRepository } from "./AssignmentContext.repository";
import {
  storedContextSchema,
  initialInputSchema,
  readOnlyAccessSchema,
} from "./assignmentContext.schemas";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import type {
  AssignmentBindResult,
  AssignmentContextIdentity,
  PreparationIssue,
} from "./WorkerAssignment.types";
import type { collectAssignmentPackage } from "./collectAssignmentPackage.service";
import { assessAssignmentReadiness } from "./assessAssignmentReadiness.validator";
import { createReadOnlyAssignmentAdapter } from "./createReadOnlyAssignmentAdapter.adapter";

type Packet = Extract<
  Awaited<ReturnType<typeof collectAssignmentPackage>>,
  { assignment: object }
>;
/** Проверки применяются также при открытии из следующего процесса. До ready обработчик закрыт. */
export async function openAssignmentContext(
  policy: RepositoryReadPolicy,
  expected: AssignmentContextIdentity,
  packet: Packet,
  repository: AssignmentContextRepository,
): Promise<AssignmentBindResult> {
  const blocked = (issue: PreparationIssue) => ({
    report: {
      ...expected,
      status: "blocked" as const,
      issues: [issue],
      effectiveAccess: null,
    },
  });
  const state = storedContextSchema.safeParse(await repository.load());
  if (!state.success)
    return blocked({
      code: "context_unavailable",
      reason: "Сохранённый контекст отсутствует или его формат недоступен.",
    });
  const { contextId, assignmentId, revision, lockSha256 } = state.data;
  const identity = { contextId, assignmentId, revision, lockSha256 };
  const input = initialInputSchema.safeParse(state.data.initialInput);
  if (
    !input.success ||
    !isDeepStrictEqual(input.data.assignment, packet.assignment)
  )
    return blocked({
      code: "context_not_delivered",
      reason: "Сохранённый ввод не содержит полного поручения этой ревизии.",
    });
  const grants = readOnlyAccessSchema.safeParse(state.data.access);
  if (!grants.success)
    return blocked({
      code: "access_mismatch",
      reason:
        "Адаптер допускает только repo_read_file, закреплённые версии файлов и пустую область записи.",
    });
  const files = [...packet.sources, ...packet.reviewFiles];
  const pins = grants.data.readPins;
  const mismatch = files.find((file) => pins[file.path] !== file.sha256);
  const unexpected = Object.keys(pins).find(
    (path) => !files.some((file) => file.path === path),
  );
  if (mismatch || unexpected)
    return blocked({
      code: "access_mismatch",
      path: mismatch?.path ?? unexpected,
      reason: "Путь или SHA-256 в правах чтения расходится с привязкой.",
    });
  const delivered = input.data.sources.map(({ path, text }) => ({
    path,
    sha256: createHash("sha256").update(text, "utf8").digest("hex"),
    bytes: Buffer.byteLength(text, "utf8"),
  }));
  const adapter = createReadOnlyAssignmentAdapter(policy, contextId, pins);
  const evidence = {
    ...identity,
    delivered,
    effectiveAccess: adapter.effectiveAccess,
  };
  const decision = assessAssignmentReadiness(
    expected,
    packet.sources,
    files.map((file) => file.path),
    packet.issues,
    evidence,
  );
  if (decision.status === "blocked")
    return {
      report: {
        ...expected,
        status: decision.status,
        issues: decision.issues,
        effectiveAccess: null,
      },
    };
  return {
    report: {
      ...evidence,
      status: decision.status,
      issues: decision.issues,
      reason:
        "Полное поручение и обязательные тексты подтверждены при чтении контекста. Права адаптера совпадают с назначением.",
    },
    context: Object.freeze({
      contextId,
      initialInput: JSON.stringify(input.data),
      scopePins: Object.freeze(
        Object.fromEntries(
          packet.reviewFiles.map(({ path, sha256 }) => [path, sha256]),
        ),
      ),
      readPins: Object.freeze({ ...pins }),
      callTool: adapter.callTool,
    }),
  };
}

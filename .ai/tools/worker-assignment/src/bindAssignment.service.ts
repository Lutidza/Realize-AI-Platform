/**
 * @file .ai/tools/worker-assignment/src/bindAssignment.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Создаёт или повторно открывает личный контекст статического аудита.
 */
import type { AssignmentBindResult } from "./WorkerAssignment.types";
import { randomUUID } from "node:crypto";
import type { RepositoryReadPolicy } from "../../../../services/ai-control-plane/src/RepositoryRead.types";
import { AssignmentContextRepository } from "./AssignmentContext.repository";
import { collectAssignmentPackage } from "./collectAssignmentPackage.service";
import { openAssignmentContext } from "./openAssignmentContext.service";

/** При переданном contextId разрешено только открытие. Существующая запись никогда не заменяется. */
export async function bindAssignment(
  policy: RepositoryReadPolicy,
  lockPath: string,
  contextId?: string,
): Promise<AssignmentBindResult> {
  const packet = await collectAssignmentPackage(policy, lockPath);
  if (!packet.packageComplete)
    return {
      report: {
        status: "blocked" as const,
        contextId: contextId ?? null,
        effectiveAccess: null,
        issues: packet.issues,
      },
    };
  const identity = {
    contextId: contextId ?? randomUUID(),
    assignmentId: packet.assignment.id,
    revision: packet.assignment.revision,
    lockSha256: packet.lockSha256,
  };
  try {
    const repository = new AssignmentContextRepository(
      policy.root,
      identity.contextId,
    );
    if (contextId === undefined) {
      const { tools, writePaths } = packet.assignment.permissions;
      await repository.create({
        ...identity,
        version: 1,
        adapter: "static-read-only",
        initialInput: {
          assignment: packet.assignment,
          sources: packet.sources.map(({ path, text }) => ({ path, text })),
        },
        access: {
          tools,
          writePaths,
          readPins: Object.fromEntries(
            [...packet.sources, ...packet.reviewFiles].map((file) => [
              file.path,
              file.sha256,
            ]),
          ),
        },
      });
    }
    return await openAssignmentContext(policy, identity, packet, repository);
  } catch {
    return {
      report: {
        ...identity,
        status: "blocked" as const,
        effectiveAccess: null,
        issues: [
          {
            code: "context_unavailable",
            reason:
              "Не удалось создать или прочитать личный файл контекста. Проверьте идентификатор, права и размер файла.",
          },
        ],
      },
    };
  }
}

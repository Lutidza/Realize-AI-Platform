/**
 * @file .ai/tools/worker-assignment/src/prepareAssignment.service.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Собирает локальный пакет из проверенных текстов и объясняет готовность к выдаче.
 */
import type { RepositoryReadPolicy } from "../../../../services/ai-control-plane/src/RepositoryRead.types";
import { collectAssignmentPackage } from "./collectAssignmentPackage.service";
import { assessAssignmentReadiness } from "./assessAssignmentReadiness.validator";

/** Предпросмотр читает входы без создания контекста и подтверждения доставки. */
export async function prepareAssignment(
  policy: RepositoryReadPolicy,
  lockPath: string,
) {
  const packet = await collectAssignmentPackage(policy, lockPath);
  if (!packet.assignment) return { ...packet, status: "blocked" as const };
  const paths = [...packet.sources, ...packet.reviewFiles].map(
    (file) => file.path,
  );
  return {
    ...packet,
    ...assessAssignmentReadiness(
      undefined,
      packet.sources,
      paths,
      packet.issues,
    ),
  };
}

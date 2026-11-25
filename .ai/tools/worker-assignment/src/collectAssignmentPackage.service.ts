/**
 * @file .ai/tools/worker-assignment/src/collectAssignmentPackage.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Собирает назначение, полные тексты и перечень проверенных файлов из закреплённой версии.
 */
import { RepositoryReadError } from "../../../../services/ai-control-plane/src/RepositoryRead.error";
import { readRepositoryFile } from "../../../../services/ai-control-plane/src/readRepositoryFile.service";
import { validateAiInstructionPath } from "../../../../services/ai-control-plane/src/aiInstructionPolicy.validator";
import type { RepositoryReadPolicy } from "../../../../services/ai-control-plane/src/RepositoryRead.types";
import type {
  AssignmentMaterial,
  PreparationIssue,
} from "./WorkerAssignment.types";
import { REPOSITORY_MAX_SCAN_BYTES } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";

import { readAssignmentDefinition } from "./readAssignmentDefinition.service";

function issue(error: unknown, path?: string): PreparationIssue {
  if (error instanceof RepositoryReadError)
    return { code: error.code, reason: error.message, path };
  throw error;
}

/** Выдаёт полные тексты только для проверенных источников. Доставка исполнителю принадлежит адаптеру запуска. */
export async function collectAssignmentPackage(
  policy: RepositoryReadPolicy,
  lockPath: string,
) {
  const issues: PreparationIssue[] = [];
  let definition: Awaited<ReturnType<typeof readAssignmentDefinition>>;
  try {
    definition = await readAssignmentDefinition(policy, lockPath);
  } catch (error) {
    return {
      packageComplete: false,
      issues: [issue(error, lockPath)],
    } as const;
  }
  const { assignment, lock, scope, lockSha256 } = definition;
  const sources: AssignmentMaterial[] = [];
  const reviewFiles: AssignmentMaterial[] = [];
  const readPaths = [...assignment.requiredSources, ...scope];
  let remainingBytes = REPOSITORY_MAX_SCAN_BYTES;
  for (const path of readPaths) {
    const required = assignment.requiredSources.includes(path);
    try {
      if (required) validateAiInstructionPath(policy, path);
      const file = await readRepositoryFile(policy, path, {
        maximumBytes: remainingBytes,
        onReadBytes: (count) => {
          remainingBytes -= count;
        },
      });
      if (file.sha256 !== lock.files[path]) {
        issues.push({
          code: "CONFLICT",
          reason: "Содержимое отличается от закреплённого SHA-256.",
          path,
        });
        continue;
      }
      const summary = { path, sha256: file.sha256, bytes: file.bytes.length };
      if (required) sources.push({ ...summary, text: file.text });
      else reviewFiles.push(summary);
    } catch (error) {
      issues.push(issue(error, path));
    }
  }
  const packageComplete = issues.length === 0;
  return {
    packageComplete,
    lockSha256,
    assignment,
    sources,
    reviewFiles,
    issues,
  } as const;
}

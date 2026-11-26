/**
 * @file .ai/tools/worker-assignment/test/checkpoints/sampleCheckpointAudit.fixture.ts
 * @version 1.1.2
 * @date 2026-11-26
 * @description Готовит попытку по временному назначению и переданному плану чтений.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mcpToolInputs } from "@realize/ai-contracts";
import { openAiChatPolicy } from "realize-ai-platform/model-providers/openai-chat-completions-policy";
import { bindAssignment } from "../../src/bindAssignment.service";
import { createTemporaryAssignment } from "../temporaryAssignment.fixture";
import type {
  CheckpointAuditInput,
  CheckpointSimulatorScript,
} from "./CheckpointScenario.types";

type ReadRange = Omit<CheckpointSimulatorScript["reads"][number], "callId">;

/** Каждая попытка получает независимую привязку задачи и использует контекст своего сценария. */
export function createCheckpointAuditInput(
  prepareContext: CheckpointAuditInput["prepareContext"],
  simulator: CheckpointSimulatorScript,
): CheckpointAuditInput {
  return {
    attemptId: randomUUID(),
    prepareContext,
    simulator,
    task: {
      projectId: randomUUID(),
      taskId: randomUUID(),
      taskRevision: 1,
      executionId: randomUUID(),
      planRevision: 1,
      stageId: "audit",
      taskAssignmentId: randomUUID(),
      assignmentRevision: 1,
    },
  };
}

/** Без явного плана имитатор запрашивает стандартное окно repo_read_file для каждого файла. */
export function sampleCheckpointAudit(
  files: Readonly<Record<string, string>> = {
    "src/module/entry.ts": "export const entry = 1;\n",
    "src/shared/value.ts": "export const value = 2;\n",
  },
  reads: readonly ReadRange[] = Object.keys(files).map((path) =>
    mcpToolInputs.repo_read_file.parse({ path }),
  ),
): CheckpointAuditInput {
  const reviewFileContents = { ...files };
  return createCheckpointAuditInput(
    async (t) => {
      const assignment = await createTemporaryAssignment(t, {
        reviewScope: { paths: Object.keys(reviewFileContents) },
        reviewFileContents,
      });
      const result = await bindAssignment(
        assignment.policy,
        assignment.lockPath,
      );
      assert(result.context, JSON.stringify(result.report.issues));
      return {
        ...assignment,
        result,
        contextId: result.context.contextId,
        model: openAiChatPolicy.model,
      };
    },
    {
      reads: reads.map((read, index) => ({
        ...read,
        callId: `read-${index + 1}`,
      })),
      report: "Отчёт имитатора о чтении файлов назначения.\n",
    },
  );
}

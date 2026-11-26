/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointSimulatorResponse.fixture.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Формирует ответ имитатора по сценарию чтений и истории запроса.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { auditMessagesSchema } from "../../src/exchange/singleReadMessages.schemas";
import type { AuditContinuation } from "../../src/exchange/SingleRead.types";
import type { CheckpointSimulatorScript } from "./CheckpointScenario.types";

/** Завершённые чтения восстанавливаются из истории запроса при каждом запуске процесса. */
export function checkpointSimulatorResponse(
  requestBody: string,
  simulator: CheckpointSimulatorScript,
  reportFromReads?: (results: AuditContinuation["result"][]) => string,
) {
  const messages = auditMessagesSchema.parse(JSON.parse(requestBody).messages);
  const results = messages.filter((message) => message.role === "tool");
  const read = simulator.reads[results.length];
  if (!read)
    return {
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: reportFromReads?.(results) ?? simulator.report,
          },
        },
      ],
    };

  return {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              type: "function",
              id: read.callId,
              function: {
                name: "repo_read_file",
                arguments: JSON.stringify({
                  path: read.path,
                  startLine: read.startLine,
                  lineCount: read.lineCount,
                }),
              },
            },
          ],
        },
      },
    ],
  };
}

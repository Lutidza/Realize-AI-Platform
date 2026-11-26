/**
 * @file .ai/tools/worker-assignment/test/publication/runCheckpointAudit.fixture.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Выполняет заданные сценарием чтения через контрольные точки до получения отчёта.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import assert from "node:assert/strict";
import type { CheckpointProcessInput } from "../checkpoints/CheckpointScenario.types";
import { runCheckpointProcess } from "../checkpoints/checkpointStorage.fixture";

export async function runCheckpointAudit(scenario: CheckpointProcessInput) {
  for (let read = 0; read < scenario.simulator.reads.length; read++) {
    assert.equal((await runCheckpointProcess(scenario, "step")).status, "pending");
  }
  assert.equal((await runCheckpointProcess(scenario, "step")).status, "received");
}

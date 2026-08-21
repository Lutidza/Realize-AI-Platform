/**
 * @file services/ai-execution-worker/src/worker.ts
 * @version 2026-08-21
 * @description Runs durable local code execution and accepted-diff preview promotion.
 */

import "dotenv/config";

import { Pool } from "pg";

import { readExecutionWorkerConfig } from "./config";
import { executeClaimedJob } from "./executor";
import { ExecutionJobRepository } from "./jobRepository";
import {
  cleanupPreviewRuntimes,
  executeClaimedPromotion,
} from "./promotionExecutor";
import { PromotionRepository } from "./promotionRepository";

const config = readExecutionWorkerConfig();
const pool = new Pool({ connectionString: config.databaseURL, max: 2 });
const repository = new ExecutionJobRepository(pool);
const promotionRepository = new PromotionRepository(pool);
let stopping = false;
let lastCleanupAt = 0;

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

const run = async (): Promise<void> => {
  console.log(
    `[ai-execution-worker] started worker=${config.workerID}; workspace=${config.workspaceRoot}; preview=${config.previewEnabled}`,
  );
  while (!stopping) {
    if (config.previewEnabled && Date.now() - lastCleanupAt >= 30_000) {
      await cleanupPreviewRuntimes({ config, repository: promotionRepository });
      lastCleanupAt = Date.now();
    }
    const job = await repository.claimNext(config.workerID);
    if (job) {
      console.log(
        `[ai-execution-worker] claimed execution=${job.executionKey}; change=${job.changeRequestID}`,
      );
      await executeClaimedJob({ config, job, repository });
      continue;
    }
    const promotion = config.previewEnabled
      ? await promotionRepository.claimNext(config.workerID)
      : undefined;
    if (promotion) {
      console.log(
        `[ai-execution-worker] claimed preview=${promotion.deploymentKey}; change=${promotion.changeRequestID}`,
      );
      await executeClaimedPromotion({
        config,
        job: promotion,
        repository: promotionRepository,
      });
      continue;
    }
    await wait(config.pollIntervalMs);
  }
};

const shutdown = (): void => {
  stopping = true;
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void run()
  .catch((error: unknown) => {
    console.error(
      `[ai-execution-worker] fatal: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

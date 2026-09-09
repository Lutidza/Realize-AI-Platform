/**
 * @file services/ai-execution-worker/src/worker.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Обрабатывает execution, preview, source/release durable queues и integrations.
 */

import { Pool } from "pg";
import { config as loadEnvironment } from "dotenv";
import {
  GitHubConnectionService,
  IntegrationRuntimeRepository,
} from "@realize/payload-ai-control/server/integration-runtime";

import { readExecutionWorkerConfig } from "./config";
import { executeClaimedJob } from "./executor";
import { ExecutionJobRepository } from "./jobRepository";
import {
  cleanupPreviewRuntimes,
  executeClaimedPromotion,
} from "./promotionExecutor";
import { PromotionRepository } from "./promotionRepository";
import { executeClaimedRelease } from "./releaseExecutor";
import { ReleaseWorkerRepository } from "./releaseRepository";
import { executeClaimedSourcePromotion } from "./sourcePromotionExecutor";
import { SourcePromotionWorkerRepository } from "./sourcePromotionRepository";

// Приоритет локального окружения Next сохраняется без замены переменных оператора.
loadEnvironment({ path: ".env.local", quiet: true });
loadEnvironment({ quiet: true });

const config = readExecutionWorkerConfig();
const pool = new Pool({ connectionString: config.databaseURL, max: 2 });
const repository = new ExecutionJobRepository(pool);
const promotionRepository = new PromotionRepository(pool);
const releaseRepository = new ReleaseWorkerRepository(pool);
const sourcePromotionRepository = new SourcePromotionWorkerRepository(pool);
const integrations = new GitHubConnectionService(
  new IntegrationRuntimeRepository(pool),
  config.integrationEncryptionKey,
);
let stopping = false;
let lastCleanupAt = 0;

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

const run = async (): Promise<void> => {
  console.log(
    `[ai-execution-worker] started worker=${config.workerID}; workspace=${config.workspaceRoot}; preview=${config.previewEnabled}; sourcePromotion=${config.sourcePromotionEnabled}; release=${config.releaseEnabled}`,
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
    const sourcePromotion = config.sourcePromotionEnabled
      ? await sourcePromotionRepository.claimNext(config.workerID)
      : undefined;
    if (sourcePromotion) {
      console.log(
        `[ai-execution-worker] claimed source-promotion=${sourcePromotion.promotionKey}; change=${sourcePromotion.changeRequestID}`,
      );
      await executeClaimedSourcePromotion({
        config,
        integrations,
        job: sourcePromotion,
        repository: sourcePromotionRepository,
      });
      continue;
    }
    const release = config.releaseEnabled
      ? await releaseRepository.claimNext(config.workerID)
      : undefined;
    if (release) {
      console.log(
        `[ai-execution-worker] claimed release=${release.candidateKey}; change=${release.changeRequestID}`,
      );
      await executeClaimedRelease({
        config,
        integrations,
        job: release,
        repository: releaseRepository,
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

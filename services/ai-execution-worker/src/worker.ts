/**
 * @file services/ai-execution-worker/src/worker.ts
 * @version 1.3.0
 * @date 2026-09-11
 * @description Обрабатывает execution, preview, source/release durable queues и integrations.
 */

import { Pool } from "pg";
import { config as loadEnvironment } from "dotenv";
import {
  CodexConnectionService,
  GitHubConnectionService,
  IntegrationRuntimeRepository,
  WorkerPresenceRepository,
} from "@realize/payload-ai-control/server/integration-runtime";

import { watchWorkerPoolErrors } from "./watchWorkerPoolErrors.service";
import { WorkerHeartbeat } from "./WorkerHeartbeat.service";
import { readExecutionWorkerConfig } from "./config";
import { readWorkerRuntimeSettings } from "./readWorkerRuntimeSettings.service";
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
const pool = new Pool({
  connectionString: config.databaseURL,
  max: 2,
  connectionTimeoutMillis: 5_000,
});
// Отдельный pool не даёт длительной lease или проверкам задержать сигнал присутствия.
const heartbeatPool = new Pool({
  connectionString: config.databaseURL,
  max: 1,
  connectionTimeoutMillis: 5_000,
  query_timeout: 5_000,
});
const presenceRepository = new WorkerPresenceRepository(heartbeatPool);
const heartbeat = new WorkerHeartbeat(presenceRepository);
watchWorkerPoolErrors([pool, heartbeatPool], () => heartbeat.markUnhealthy());
const codex = new CodexConnectionService({
  pool,
  encryptionKey: config.integrationEncryptionKey,
});
const repository = new ExecutionJobRepository(pool);
const promotionRepository = new PromotionRepository(pool);
const releaseRepository = new ReleaseWorkerRepository(pool);
const sourcePromotionRepository = new SourcePromotionWorkerRepository(pool);
const integrationRegistry = new IntegrationRuntimeRepository(pool);
const integrations = new GitHubConnectionService(
  integrationRegistry,
  config.integrationEncryptionKey,
);
let stopping = false;
let lastCleanupAt = 0;

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

const run = async (): Promise<void> => {
  await heartbeat.start();
  console.log(
    `[ai-execution-worker] started worker=${config.workerID}; workspace=${config.workspaceRoot}`,
  );
  while (!stopping) {
    await heartbeat.idle();
    if (Date.now() - lastCleanupAt >= 30_000) {
      lastCleanupAt = Date.now();
      try {
        await presenceRepository.cleanup();
        await cleanupPreviewRuntimes({
          config,
          repository: promotionRepository,
        });
      } catch {
        // Недоступность cleanup не должна препятствовать следующему чтению настроек БД.
        console.error("[ai-execution-worker] preview cleanup unavailable");
      }
    }
    const settings = await readWorkerRuntimeSettings({
      repository: integrationRegistry,
      config,
    });
    heartbeat.setCapabilities({
      execution: settings.executionEnabled,
      preview: settings.previewEnabled,
      sourcePromotion: settings.sourcePromotionEnabled,
      release: settings.releaseEnabled,
    });
    // Восстановление heartbeat обязательно до нового claim после потери БД.
    if (!(await heartbeat.sync()) || !heartbeat.canClaim || stopping) {
      if (!stopping) await wait(config.pollIntervalMs);
      continue;
    }
    const job = settings.executionEnabled
      ? await repository.claimNext(heartbeat.instanceKey)
      : undefined;
    if (job) {
      await heartbeat.busy("execution", String(job.changeRequestID));
      console.log(
        `[ai-execution-worker] claimed execution=${job.executionKey}; change=${job.changeRequestID}`,
      );
      await executeClaimedJob({ config, codex, job, repository });
      continue;
    }
    const promotion =
      !stopping && heartbeat.canClaim && settings.previewEnabled
        ? await promotionRepository.claimNext(heartbeat.instanceKey)
        : undefined;
    if (promotion) {
      await heartbeat.busy("preview", String(promotion.changeRequestID));
      console.log(
        `[ai-execution-worker] claimed preview=${promotion.deploymentKey}; change=${promotion.changeRequestID}`,
      );
      await executeClaimedPromotion({
        config,
        codex,
        job: promotion,
        repository: promotionRepository,
      });
      continue;
    }
    const sourcePromotion =
      !stopping && heartbeat.canClaim && settings.sourcePromotionEnabled
        ? await sourcePromotionRepository.claimNext(heartbeat.instanceKey)
        : undefined;
    if (sourcePromotion) {
      await heartbeat.busy(
        "sourcePromotion",
        String(sourcePromotion.changeRequestID),
      );
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
    const release =
      !stopping && heartbeat.canClaim && settings.releaseEnabled
        ? await releaseRepository.claimNext(heartbeat.instanceKey)
        : undefined;
    if (release) {
      await heartbeat.busy("release", String(release.changeRequestID));
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
  heartbeat.drain();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void run()
  .catch(() => {
    console.error("[ai-execution-worker] fatal: worker runtime unavailable");
    process.exitCode = 1;
  })
  .finally(async () => {
    await heartbeat.finish(process.exitCode === 1);
    await Promise.all([pool.end(), heartbeatPool.end()]);
  });

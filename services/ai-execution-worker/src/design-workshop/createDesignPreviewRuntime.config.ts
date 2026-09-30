/**
 * @file services/ai-execution-worker/src/design-workshop/createDesignPreviewRuntime.config.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Подключает очередь preview к общему worker только при готовых schema и Linux sandbox.
 * @see documentation/specifications/design-workshop.md
 */
import type { Pool } from "pg";
import { openBackgroundPayload } from "@realize/payload-ai-control/server/background-runtime";
import { readDesignPreviewSource } from "@realize/payload-ai-control/server/workshop";
import type { ExecutionWorkerConfig } from "../ExecutionWorkerConfig.types";
import { readDesignPreviewToolchain } from "./designPreviewToolchain.config";
import { DesignPreviewQueue } from "./DesignPreviewQueue.repository";
import { DesignPreviewSandbox } from "./DesignPreviewSandbox.adapter";
import { DesignPreviewStaging } from "./DesignPreviewStaging.repository";
import { DesignPreviewExecutor } from "./DesignPreviewExecutor.service";
import { designPreviewStorageRoot } from "./designPreviewStorageRoot.config";

export async function createDesignPreviewRuntime(
  pool: Pool,
  config: ExecutionWorkerConfig,
) {
  const queue = new DesignPreviewQueue(pool);
  if (!(await queue.ready())) return undefined;
  const sandbox = new DesignPreviewSandbox(await readDesignPreviewToolchain());
  if (!(await sandbox.ready())) return undefined;
  const staging = new DesignPreviewStaging(
    designPreviewStorageRoot(config.previewRoot, config.databaseURL),
    config.repositoryRoot,
  );
  await staging.prepare();
  const { default: configuration } =
    await import("../../../../src/payload.config");
  const payload = await openBackgroundPayload(configuration);
  const executor = new DesignPreviewExecutor({
    queue,
    staging,
    sandbox,
    repositoryRoot: config.repositoryRoot,
    source: (job) =>
      readDesignPreviewSource(
        payload,
        job.actorId,
        job.projectId,
        job.revisionId,
        job.mcpAuthorization,
      ),
  });
  return {
    queue,
    executor,
    cleanup: async () => {
      await queue.cleanup();
      await staging.cleanup(queue, sandbox);
    },
    close: () => payload.destroy(),
  };
}

/**
 * @file services/ai-execution-worker/src/design-workshop/DesignPreviewExecutor.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Задаёт зависимости bounded preview и текущую авторизацию без модели.
 * @see documentation/specifications/design-workshop.md
 */
import type { DesignWorkspaceSource } from "@realize/ai-contracts";
import type { ClaimedDesignPreview } from "./DesignPreviewJob.types";
import type { DesignPreviewQueue } from "./DesignPreviewQueue.repository";
import type { DesignPreviewSandbox } from "./DesignPreviewSandbox.adapter";
import type { DesignPreviewStaging } from "./DesignPreviewStaging.repository";
export type DesignPreviewExecutorOptions = {
  repositoryRoot: string;
  queue: DesignPreviewQueue;
  staging: DesignPreviewStaging;
  sandbox: DesignPreviewSandbox;
  source: (job: ClaimedDesignPreview) => Promise<DesignWorkspaceSource>;
};

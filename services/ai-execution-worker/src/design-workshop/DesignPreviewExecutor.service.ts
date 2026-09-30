/**
 * @file services/ai-execution-worker/src/design-workshop/DesignPreviewExecutor.service.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Координирует source, lease, sandbox capture и fenced commit с очисткой процессов.
 * @see documentation/specifications/design-workshop.md
 */
import { join } from "node:path";
import {
  ContractValidationError,
  DESIGN_PREVIEW,
  type DesignPreviewErrorCode,
} from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  type DesignPreviewArtifact,
} from "@realize/change-engine";
import { DesignWorkspace } from "./DesignWorkspace.service";
import { DesignPreviewError } from "./DesignPreview.error";
import type { ClaimedDesignPreview } from "./DesignPreviewJob.types";
import type { DesignPreviewExecutorOptions } from "./DesignPreviewExecutor.types";

export class DesignPreviewExecutor {
  constructor(private readonly options: DesignPreviewExecutorOptions) {}
  async execute(job: ClaimedDesignPreview): Promise<void> {
    const { queue, staging, sandbox, source } = this.options;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let renewal: Promise<void> | undefined;
    let closed = false,
      directory: string | undefined;
    let failure: DesignPreviewErrorCode = "INTERNAL_ERROR";
    const authorize = async () => {
      let current;
      try {
        current = await source(job);
      } catch (error) {
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? error.status
            : undefined;
        throw new DesignPreviewError(
          [401, 403, 404].includes(Number(status))
            ? "AUTH_REVOKED"
            : error instanceof ContractValidationError
              ? "SOURCE_INVALID"
              : "INTERNAL_ERROR",
        );
      }
      if (hashCanonicalJSON(current.pin) !== hashCanonicalJSON(job.source))
        throw new DesignPreviewError("SOURCE_INVALID");
      return current;
    };
    const renew = () => {
      if (closed) return;
      timer = setTimeout(() => {
        renewal = (async () => {
          try {
            await authorize();
            if (!(await queue.renew(job))) abort.abort();
          } catch (error) {
            failure =
              error instanceof DesignPreviewError
                ? error.code
                : "INTERNAL_ERROR";
            abort.abort();
          } finally {
            if (!closed && !abort.signal.aborted) renew();
          }
        })();
      }, DESIGN_PREVIEW.heartbeatMs);
    };
    try {
      const current = await authorize();
      if (!(await queue.renew(job))) return;
      renew();
      directory = await staging.create(job);
      const workspace = new DesignWorkspace({
        repositoryRoot: this.options.repositoryRoot,
        storageRoot: join(directory, "workspace"),
      });
      const receipt = await workspace.materialize(current, abort.signal);
      const resolved = await workspace.resolve(receipt);
      let captureFailure: unknown;
      try {
        await sandbox.capture({
          directory: resolved.directory,
          outputDirectory: join(directory, "output"),
          configurationPath: join(directory, "config.json"),
          manifest: resolved.manifest,
          entryPath: job.entryPath,
          unit: staging.unit(job.jobId, job.leaseToken),
          signal: abort.signal,
        });
      } catch (error) {
        captureFailure = error;
      }
      if (abort.signal.aborted) throw new DesignPreviewError(failure);
      if (
        captureFailure instanceof DesignPreviewError &&
        captureFailure.code === "TIMEOUT"
      )
        throw captureFailure;
      // При ошибке сборки runner оставляет фиксированный code; сырые stderr не используются.
      let artifact: DesignPreviewArtifact;
      try {
        artifact = await staging.artifact(directory, job);
      } catch (error) {
        // При отказе sandbox до старта runner результата нет; сохраняем исходную причину запуска.
        throw error instanceof DesignPreviewError
          ? error
          : (captureFailure ?? error);
      }
      if (captureFailure) throw captureFailure;
      await authorize();
      if (!abort.signal.aborted) await queue.complete(job, artifact);
    } catch (error) {
      failure = error instanceof DesignPreviewError ? error.code : failure;
      await queue.fail(job, failure).catch(() => undefined);
    } finally {
      closed = true;
      if (timer) clearTimeout(timer);
      await renewal;
      await sandbox.stop(staging.unit(job.jobId, job.leaseToken));
      if (directory) await staging.remove(directory);
    }
  }
}

/**
 * @file services/ai-execution-worker/src/design-workshop/DesignPreviewStaging.repository.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Владеет каталогом job/token, проверкой PNG и очисткой только завершённых попыток.
 * @see documentation/specifications/design-workshop.md
 */
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { DESIGN_PREVIEW } from "@realize/ai-contracts";
import {
  validateDesignPreviewArtifact,
  type DesignPreviewArtifact,
} from "@realize/change-engine";
import {
  openStorageRoot,
  privateDirectory,
  readBoundedFile,
  isFileError,
} from "./designWorkspaceFilesystem.adapter";
import type { ClaimedDesignPreview } from "./DesignPreviewJob.types";
import type { DesignPreviewQueue } from "./DesignPreviewQueue.repository";
import type { DesignPreviewSandbox } from "./DesignPreviewSandbox.adapter";
import { DesignPreviewError } from "./DesignPreview.error";

const attemptPattern =
  /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
export class DesignPreviewStaging {
  constructor(
    private readonly root: string,
    private readonly repositoryRoot: string,
  ) {}
  async prepare(): Promise<void> {
    await openStorageRoot(this.root, this.repositoryRoot, true);
  }
  unit(jobId: string, token: string) {
    if (!attemptPattern.test(jobId + "." + token))
      throw new DesignPreviewError("SOURCE_INVALID");
    return (
      "realize-workshop-" +
      jobId.replaceAll("-", "") +
      "-" +
      token.replaceAll("-", "") +
      ".service"
    );
  }
  async create(job: ClaimedDesignPreview): Promise<string> {
    this.unit(job.jobId, job.leaseToken);
    const root = await openStorageRoot(this.root, this.repositoryRoot, true);
    const directory = join(root, job.jobId + "." + job.leaseToken);
    await mkdir(directory, { mode: 0o700 });
    await mkdir(join(directory, "output"), { mode: 0o700 });
    return directory;
  }
  async artifact(
    directory: string,
    job: ClaimedDesignPreview,
  ): Promise<DesignPreviewArtifact> {
    const result = JSON.parse(
      (
        await readBoundedFile(join(directory, "output", "result.json"), 1024)
      ).toString("utf8"),
    );
    if (result.ok !== true)
      throw new DesignPreviewError(
        result.error === "BUILD_FAILED" ? "BUILD_FAILED" : "RENDER_FAILED",
      );
    const evidence: DesignPreviewArtifact["evidence"] = {
      renderer: DESIGN_PREVIEW.renderer,
      source: job.source,
      entryPath: job.entryPath,
      toolchain: result.toolchain,
      images: [],
    };
    const images: DesignPreviewArtifact["images"] = {
      "390": "",
      "768": "",
      "1440": "",
    };
    for (const width of DESIGN_PREVIEW.widths) {
      const path = join(directory, "output", width + ".png");
      if ((await lstat(path)).size > DESIGN_PREVIEW.imageBytes)
        throw new DesignPreviewError("LIMIT_EXCEEDED");
      const bytes = await readBoundedFile(path, DESIGN_PREVIEW.imageBytes);
      images[String(width) as keyof typeof images] = bytes.toString("base64");
      evidence.images.push({
        width,
        height: DESIGN_PREVIEW.height,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    if (
      evidence.images.reduce((sum, image) => sum + image.bytes, 0) >
      DESIGN_PREVIEW.imagesBytes
    )
      throw new DesignPreviewError("LIMIT_EXCEEDED");
    return validateDesignPreviewArtifact(evidence, images);
  }
  async remove(directory: string): Promise<void> {
    if (
      join(this.root, basename(directory)) !== directory ||
      !attemptPattern.test(basename(directory))
    )
      throw new DesignPreviewError("INTERNAL_ERROR");
    const writable = async (path: string): Promise<void> => {
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return;
      await privateDirectory(path);
      await chmod(path, 0o700);
      for (const child of await readdir(path))
        await writable(join(path, child));
    };
    try {
      await writable(directory);
      await rm(directory, { recursive: true, force: true });
    } catch (error) {
      if (!isFileError(error, "ENOENT")) throw error;
    }
  }
  async cleanup(
    queue: DesignPreviewQueue,
    sandbox: DesignPreviewSandbox,
  ): Promise<void> {
    let root: string;
    try {
      root = await openStorageRoot(this.root, this.repositoryRoot, false);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "NOT_FOUND"
      )
        return;
      throw error;
    }
    for (const name of await readdir(root)) {
      const match = attemptPattern.exec(name);
      if (!match || (await queue.isActive(match[1], match[2]))) continue;
      await sandbox.stop(this.unit(match[1], match[2]));
      await this.remove(join(root, name));
    }
  }
}

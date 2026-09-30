/**
 * @file services/ai-execution-worker/src/design-workshop/DesignWorkspaceFiles.repository.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Записывает и проверяет полный набор bounded файлов одной immutable версии.
 * @see documentation/specifications/design-workshop.md
 */
import { createHash } from "node:crypto";
import { chmod, lstat, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  designWorkspaceManifestSchema,
  type DesignWorkspaceManifest,
  type DesignWorkspaceReceipt,
  type DesignWorkspaceSource,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { DesignWorkspaceError } from "./DesignWorkspace.error";
import { DESIGN_WORKSPACE_STORAGE as limits } from "./designWorkspace.constants";
import {
  ensureDirectory,
  entries,
  privateDirectory,
  readBoundedFile,
  readJson,
  syncDirectory,
  writeFileDurably,
  writeJsonAtomically,
} from "./designWorkspaceFilesystem.adapter";

/** Точный набор каталогов вычисляется из manifest; неожиданные вложения не обходятся. */
function directories(manifest: DesignWorkspaceManifest): string[] {
  const result = new Set<string>();
  for (const file of manifest.files) {
    let directory = dirname(file.path);
    while (directory !== ".") {
      result.add(directory);
      directory = dirname(directory);
    }
  }
  if (result.size > limits.maximumDirectories)
    throw new DesignWorkspaceError("CAPACITY");
  return [...result].sort(
    (left, right) =>
      left.split("/").length - right.split("/").length ||
      left.localeCompare(right),
  );
}

export class DesignWorkspaceFiles {
  async write(
    directory: string,
    source: DesignWorkspaceSource,
    manifest: DesignWorkspaceManifest,
    signal?: AbortSignal,
  ): Promise<void> {
    const children = directories(manifest);
    await privateDirectory(directory);
    for (const relative of children) {
      if (signal?.aborted) throw new DesignWorkspaceError("CANCELLED");
      await ensureDirectory(join(directory, relative));
    }
    for (const file of source.snapshot.files) {
      if (signal?.aborted) throw new DesignWorkspaceError("CANCELLED");
      await writeFileDurably(join(directory, file.path), file.content);
    }
    await writeJsonAtomically(join(directory, limits.manifest), manifest);
    // Сначала fsync всех entries, затем readonly permissions; код макета не исполняется.
    for (const relative of [...children].reverse())
      await syncDirectory(join(directory, relative));
    await syncDirectory(directory);
  }

  async seal(
    directory: string,
    manifest: DesignWorkspaceManifest,
  ): Promise<void> {
    for (const file of manifest.files)
      await chmod(join(directory, file.path), 0o400);
    await chmod(join(directory, limits.manifest), 0o400);
    for (const child of directories(manifest).reverse()) {
      await chmod(join(directory, child), 0o500);
      await syncDirectory(join(directory, child));
    }
    // POSIX rename между родителями требует write на перемещаемом каталоге.
    // Его root закрывается после публикации, до durable receipt.
    await syncDirectory(directory);
  }

  async finishPublication(directory: string): Promise<void> {
    await privateDirectory(directory);
    await chmod(directory, 0o500);
    await syncDirectory(directory);
  }

  /** Удаляется только лишняя prepared-копия после проверки уже опубликованной версии. */
  async discardPrepared(
    directory: string,
    receipt: DesignWorkspaceReceipt,
  ): Promise<void> {
    const manifest = await this.verify(directory, receipt);
    await chmod(directory, 0o700);
    for (const child of directories(manifest))
      await chmod(join(directory, child), 0o700);
    await rm(directory, { recursive: true });
  }

  /** Даже replay сверяет реальные bytes и весь tree; receipt не прикрывает испорченный artifact. */
  async verify(
    directory: string,
    receipt: DesignWorkspaceReceipt,
  ): Promise<DesignWorkspaceManifest> {
    await privateDirectory(directory);
    const parsed = designWorkspaceManifestSchema.safeParse(
      await readJson(join(directory, limits.manifest)),
    );
    if (!parsed.success) throw new DesignWorkspaceError("INTEGRITY");
    const manifest = parsed.data;
    const expectedReceipt: DesignWorkspaceReceipt = {
      schemaVersion: manifest.schemaVersion,
      bindingId: manifest.bindingId,
      projectId: manifest.projectId,
      revision: manifest.revision,
      mode: "snapshot_directory",
      manifestHash: hashCanonicalJSON(manifest),
      fileCount: manifest.files.length,
      totalBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    };
    if (hashCanonicalJSON(expectedReceipt) !== hashCanonicalJSON(receipt))
      throw new DesignWorkspaceError("CONFLICT");
    const files = new Map(manifest.files.map((file) => [file.path, file]));
    const folders = directories(manifest);
    const allowedDirectories = new Set(folders);
    for (const relative of ["", ...folders]) {
      const names = await entries(
        join(directory, relative),
        manifest.files.length + folders.length + 1,
      );
      const expected = [...files.keys(), ...folders, limits.manifest]
        .filter((path) => dirname(path) === (relative || "."))
        .map((path) => path.slice(relative ? relative.length + 1 : 0))
        .sort();
      if (JSON.stringify(names) !== JSON.stringify(expected))
        throw new DesignWorkspaceError("INTEGRITY");
      for (const name of names) {
        const path = relative ? `${relative}/${name}` : name;
        if (allowedDirectories.has(path)) {
          await privateDirectory(join(directory, path));
          continue;
        }
        const stat = await lstat(join(directory, path));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
          throw new DesignWorkspaceError("INTEGRITY");
        if (path === limits.manifest) continue;
        const expectedFile = files.get(path)!;
        const bytes = await readBoundedFile(
          join(directory, path),
          expectedFile.bytes,
        );
        if (
          bytes.length !== expectedFile.bytes ||
          createHash("sha256").update(bytes).digest("hex") !==
            expectedFile.sha256
        )
          throw new DesignWorkspaceError("INTEGRITY");
      }
    }
    return manifest;
  }
}

/**
 * @file services/ai-execution-worker/src/design-workshop/DesignWorkspace.repository.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Хранит binding, checkpoints и receipts файловой проекции без изменения DB head.
 * @see documentation/specifications/design-workshop.md
 */
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  designWorkspaceReceiptSchema,
  type DesignWorkspacePin,
  type DesignWorkspaceReceipt,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { DesignWorkspaceError } from "./DesignWorkspace.error";
import type {
  DesignWorkspaceAttempt,
  DesignWorkspaceBinding,
  DesignWorkspaceCheckpoint,
} from "./DesignWorkspace.types";
import { DESIGN_WORKSPACE_STORAGE as limits } from "./designWorkspace.constants";
import { designWorkspaceCheckpointSchema } from "./designWorkspaceStorage.schemas";
import {
  ensureDirectory,
  entries,
  exists,
  isFileError,
  privateDirectory,
  readJson,
  syncDirectory,
  writeJsonAtomically,
} from "./designWorkspaceFilesystem.adapter";

export class DesignWorkspaceRepository {
  constructor(private readonly root: string) {}

  /** Полный binding публикуется целым каталогом; одинаковые конкурентные создания сходятся. */
  async binding(
    pin: DesignWorkspacePin,
    create: boolean,
  ): Promise<DesignWorkspaceBinding> {
    await privateDirectory(this.root);
    const bindings = join(this.root, "bindings"),
      initializing = join(this.root, "initializing");
    if (create) {
      await ensureDirectory(bindings);
      await ensureDirectory(initializing);
    } else if (!(await exists(bindings)))
      throw new DesignWorkspaceError("NOT_FOUND");
    await privateDirectory(bindings);
    const directory = join(bindings, pin.bindingId);
    const identity = {
      schemaVersion: "1.0",
      bindingId: pin.bindingId,
      projectId: pin.projectId,
    };
    if (!(await exists(directory))) {
      if (!create) throw new DesignWorkspaceError("NOT_FOUND");
      const candidate = join(initializing, randomUUID());
      await mkdir(candidate, { mode: 0o700 });
      try {
        await writeJsonAtomically(join(candidate, limits.identity), identity);
        for (const child of ["revisions", "transactions", "receipts"])
          await ensureDirectory(join(candidate, child));
        await syncDirectory(candidate);
        try {
          await rename(candidate, directory);
          await syncDirectory(bindings);
        } catch (error) {
          if (!isFileError(error, "EEXIST") && !isFileError(error, "ENOTEMPTY"))
            throw error;
        }
      } finally {
        await rm(candidate, { recursive: true, force: true });
      }
    }
    await privateDirectory(directory);
    if (
      hashCanonicalJSON(await readJson(join(directory, limits.identity))) !==
      hashCanonicalJSON(identity)
    )
      throw new DesignWorkspaceError("CONFLICT");
    if (
      JSON.stringify(await entries(directory, 4)) !==
      JSON.stringify(
        [limits.identity, "receipts", "revisions", "transactions"].sort(),
      )
    )
      throw new DesignWorkspaceError("INTEGRITY");
    const result = {
      directory,
      revisions: join(directory, "revisions"),
      transactions: join(directory, "transactions"),
      receipts: join(directory, "receipts"),
    };
    for (const child of [
      result.revisions,
      result.transactions,
      result.receipts,
    ])
      await privateDirectory(child);
    return result;
  }

  async attempts(
    binding: DesignWorkspaceBinding,
  ): Promise<DesignWorkspaceAttempt[]> {
    const result: DesignWorkspaceAttempt[] = [];
    for (const name of await entries(
      binding.transactions,
      limits.attemptsPerBinding,
    )) {
      if (!/^[a-f0-9-]{36}$/.test(name))
        throw new DesignWorkspaceError("INTEGRITY");
      const directory = join(binding.transactions, name);
      try {
        await privateDirectory(directory);
      } catch (error) {
        if (isFileError(error, "ENOENT")) continue;
        throw error;
      }
      result.push({ directory, workspace: join(directory, "workspace") });
    }
    return result;
  }

  async begin(
    binding: DesignWorkspaceBinding,
    receipt: DesignWorkspaceReceipt,
  ): Promise<DesignWorkspaceAttempt> {
    await this.attempts(binding);
    const directory = join(binding.transactions, randomUUID());
    await mkdir(directory, { mode: 0o700 });
    // Admission сверяется после mkdir тоже; число одновременно пишущих jobs задаёт worker owner.
    try {
      await this.attempts(binding);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
    const attempt = { directory, workspace: join(directory, "workspace") };
    await mkdir(attempt.workspace, { mode: 0o700 });
    await this.checkpoint(attempt, {
      schemaVersion: "1.0",
      phase: "staging",
      receipt,
    });
    await syncDirectory(binding.transactions);
    return attempt;
  }

  async checkpoint(
    attempt: DesignWorkspaceAttempt,
    checkpoint: DesignWorkspaceCheckpoint,
  ): Promise<void> {
    await writeJsonAtomically(
      join(attempt.directory, limits.checkpoint),
      checkpoint,
    );
  }

  async readCheckpoint(
    attempt: DesignWorkspaceAttempt,
  ): Promise<DesignWorkspaceCheckpoint | undefined> {
    const file = join(attempt.directory, limits.checkpoint);
    if (!(await exists(file))) return undefined;
    let raw: unknown;
    try {
      raw = await readJson(file);
    } catch (error) {
      if (isFileError(error, "ENOENT")) return undefined;
      throw error;
    }
    const parsed = designWorkspaceCheckpointSchema.safeParse(raw);
    if (!parsed.success) throw new DesignWorkspaceError("INTEGRITY");
    return parsed.data;
  }

  /** Rename никогда не заменяет непустую published revision; полный artifact всегда содержит manifest. */
  async publish(
    binding: DesignWorkspaceBinding,
    attempt: DesignWorkspaceAttempt,
    revisionId: string,
  ): Promise<string> {
    const target = join(binding.revisions, revisionId);
    try {
      await rename(attempt.workspace, target);
    } catch (error) {
      if (
        !isFileError(error, "EEXIST") &&
        !isFileError(error, "ENOTEMPTY") &&
        !isFileError(error, "ENOENT")
      )
        throw error;
      if (!(await exists(target))) throw error;
    }
    await syncDirectory(binding.revisions);
    await syncDirectory(attempt.directory).catch((error: unknown) => {
      if (!isFileError(error, "ENOENT")) throw error;
    });
    return target;
  }

  async receipt(
    binding: DesignWorkspaceBinding,
    expected: DesignWorkspaceReceipt,
    create: boolean,
  ): Promise<DesignWorkspaceReceipt> {
    const file = join(binding.receipts, `${expected.revision.revisionId}.json`);
    if (await exists(file)) {
      const parsed = designWorkspaceReceiptSchema.safeParse(
        await readJson(file),
      );
      if (
        !parsed.success ||
        hashCanonicalJSON(parsed.data) !== hashCanonicalJSON(expected)
      )
        throw new DesignWorkspaceError("INTEGRITY");
      return parsed.data;
    }
    if (!create) throw new DesignWorkspaceError("NOT_FOUND");
    await writeJsonAtomically(file, expected);
    return expected;
  }
}

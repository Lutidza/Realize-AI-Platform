/**
 * @file services/ai-control-plane/src/owner-engineering/OwnerEngineeringRun.repository.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Сохраняет начало исполнения до модели и исключает параллельный либо повторный запуск записи.
 * @see documentation/architecture/codex-integration.md
 */
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import type {
  OwnerEngineeringRunOutcome,
  OwnerEngineeringRunReceipt,
} from "./OwnerEngineeringRuntime.types";

/** Журнал не хранит текст задания или секретный допуск; unknown после crash требует разбора, а не replay. */
export class OwnerEngineeringRunRepository {
  constructor(private readonly stateRoot: string) {}

  async acquire(receipt: OwnerEngineeringRunReceipt) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(receipt.runID))
      throw Error("owner_engineering_run_invalid");
    await this.assertPrivateDirectory(this.stateRoot);
    const receiptsRoot = join(this.stateRoot, "runs");
    await mkdir(receiptsRoot, { recursive: true, mode: 0o700 });
    await this.assertPrivateDirectory(receiptsRoot);
    const receiptPath = join(receiptsRoot, `${receipt.runID}.json`);
    // Наличие любых байтов означает, что этот run уже мог выполнить побочный эффект.
    if (
      await lstat(receiptPath).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      )
    )
      throw Error("owner_engineering_run_already_started");
    const lockPath = join(this.stateRoot, "active.json");
    const lockBytes = JSON.stringify({
      runID: receipt.runID,
      pid: process.pid,
      nonce: randomUUID(),
      startedAt: receipt.startedAt,
    });
    const lock = await open(lockPath, "wx", 0o600).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST")
          throw Error("owner_engineering_busy_or_recovery_required");
        throw error;
      },
    );
    let durable = false;
    try {
      await lock.writeFile(lockBytes);
      await lock.sync();
      await lock.close();
      await this.syncDirectory(this.stateRoot);
      const file = await open(receiptPath, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(receipt));
        await file.sync();
        durable = true;
      } finally {
        await file.close();
      }
      await this.syncDirectory(receiptsRoot);
    } catch (error) {
      await lock.close().catch(() => undefined);
      if (
        !durable &&
        (await readFile(lockPath, "utf8").catch(() => "")) === lockBytes
      )
        await unlink(lockPath);
      throw error;
    }
    let settled = false;
    return {
      finish: async (outcome: OwnerEngineeringRunOutcome) => {
        if (settled) return;
        if ((await readFile(lockPath, "utf8")) !== lockBytes)
          throw Error("owner_engineering_lease_changed");
        const temporary = `${receiptPath}.${randomUUID()}.tmp`;
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(
            JSON.stringify({
              ...receipt,
              outcome,
              finishedAt: new Date().toISOString(),
            }),
          );
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, receiptPath);
        await this.syncDirectory(receiptsRoot);
        await unlink(lockPath);
        await this.syncDirectory(this.stateRoot);
        settled = true;
      },
    };
  }

  private async syncDirectory(path: string) {
    const directory = await open(path, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private async assertPrivateDirectory(path: string) {
    const stat = await lstat(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0 ||
      (await realpath(path)) !== path
    )
      throw Error("owner_engineering_state_invalid");
  }
}

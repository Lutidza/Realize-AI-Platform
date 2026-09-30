/**
 * @file services/ai-execution-worker/src/design-workshop/DesignWorkspace.service.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Материализует точную DB revision, восстанавливает публикацию и выдаёт проверенное чтение.
 * @see documentation/specifications/design-workshop.md
 */
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  ContractValidationError,
  designWorkspaceReceiptSchema,
  type DesignFile,
  type DesignWorkspaceReceipt,
} from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  prepareDesignWorkspace,
} from "@realize/change-engine";
import { DesignWorkspaceError } from "./DesignWorkspace.error";
import { DesignWorkspaceFiles } from "./DesignWorkspaceFiles.repository";
import { DesignWorkspaceRepository } from "./DesignWorkspace.repository";
import type {
  DesignWorkspaceAttempt,
  DesignWorkspaceBinding,
  DesignWorkspaceOptions,
  DesignWorkspacePhase,
  ResolvedDesignWorkspace,
} from "./DesignWorkspace.types";
import {
  exists,
  isFileError,
  openStorageRoot,
  readBoundedFile,
  syncDirectory,
} from "./designWorkspaceFilesystem.adapter";

/** Проекция не выдаёт права на исполнение: jobs проверяют ACL/grant до передачи server-owned source. */
export class DesignWorkspace {
  private readonly files = new DesignWorkspaceFiles();
  private readonly options: DesignWorkspaceOptions;
  constructor(options: DesignWorkspaceOptions) {
    this.options = { ...options };
  }

  private async repository(
    create: boolean,
  ): Promise<DesignWorkspaceRepository> {
    return new DesignWorkspaceRepository(
      await openStorageRoot(
        this.options.storageRoot,
        this.options.repositoryRoot,
        create,
      ),
    );
  }

  private async notify(
    phase: DesignWorkspacePhase,
    receipt: DesignWorkspaceReceipt,
  ): Promise<void> {
    await this.options.onCheckpoint?.({
      phase,
      bindingId: receipt.bindingId,
      revisionId: receipt.revision.revisionId,
    });
  }

  private fail(error: unknown): never {
    if (
      error instanceof DesignWorkspaceError ||
      error instanceof ContractValidationError
    )
      throw error;
    throw new DesignWorkspaceError("IO");
  }

  private async prepared(
    repository: DesignWorkspaceRepository,
    binding: DesignWorkspaceBinding,
    receipt: DesignWorkspaceReceipt,
  ): Promise<DesignWorkspaceAttempt | undefined> {
    for (const attempt of await repository.attempts(binding)) {
      const checkpoint = await repository.readCheckpoint(attempt);
      if (!checkpoint) continue;
      if (
        checkpoint.receipt.bindingId !== receipt.bindingId ||
        checkpoint.receipt.projectId !== receipt.projectId
      )
        throw new DesignWorkspaceError("INTEGRITY");
      if (
        checkpoint.receipt.revision.revisionId !== receipt.revision.revisionId
      )
        continue;
      if (hashCanonicalJSON(checkpoint.receipt) !== hashCanonicalJSON(receipt))
        throw new DesignWorkspaceError("CONFLICT");
      // Активные/оборванные staging попытки не трогаем: lease/retention принадлежат будущему job owner.
      if (checkpoint.phase !== "prepared") continue;
      try {
        await this.files.verify(attempt.workspace, receipt);
        return attempt;
      } catch (error) {
        // Другой процесс мог уже атомарно переместить эту готовую попытку.
        if (
          isFileError(error, "ENOENT") &&
          (await exists(join(binding.revisions, receipt.revision.revisionId)))
        )
          continue;
        throw error;
      }
    }
    return undefined;
  }

  /** Повтор и восстановление возвращают одну квитанцию, включая отказ после rename до ответа. */
  async materialize(
    value: unknown,
    signal?: AbortSignal,
  ): Promise<DesignWorkspaceReceipt> {
    try {
      const { source, manifest, receipt } = prepareDesignWorkspace(value);
      if (signal?.aborted) throw new DesignWorkspaceError("CANCELLED");
      const repository = await this.repository(true);
      const binding = await repository.binding(source.pin, true);
      const target = join(binding.revisions, receipt.revision.revisionId);
      if (await exists(target)) {
        await this.files.verify(target, receipt);
        await this.files.finishPublication(target);
        return await repository.receipt(binding, receipt, true);
      }
      let attempt = await this.prepared(repository, binding, receipt);
      if (!attempt && !(await exists(target))) {
        attempt = await repository.begin(binding, receipt);
        await this.notify("staging", receipt);
        await this.files.write(attempt.workspace, source, manifest, signal);
        await this.files.verify(attempt.workspace, receipt);
        await this.files.seal(attempt.workspace, manifest);
        await repository.checkpoint(attempt, {
          schemaVersion: "1.0",
          phase: "prepared",
          receipt,
        });
        await this.notify("prepared", receipt);
      }
      if (signal?.aborted) throw new DesignWorkspaceError("CANCELLED");
      if (attempt) {
        // Готовая попытка могла быть опубликована другим процессом во время recovery.
        if (!(await exists(target)))
          await repository.publish(
            binding,
            attempt,
            receipt.revision.revisionId,
          );
      }
      await this.files.verify(target, receipt);
      await this.files.finishPublication(target);
      await this.notify("published", receipt);
      const committed = await repository.receipt(binding, receipt, true);
      await this.notify("committed", receipt);
      if (attempt) {
        try {
          if (await exists(attempt.workspace))
            await this.files.discardPrepared(attempt.workspace, receipt);
          await rm(attempt.directory, { recursive: true, force: true });
          await syncDirectory(binding.transactions);
        } catch (error) {
          if (!isFileError(error, "ENOENT")) throw error;
        }
      }
      return committed;
    } catch (error) {
      return this.fail(error);
    }
  }

  /** Внутренний worker port для checks/preview; никакого создания root/binding при чтении. */
  async resolve(value: unknown): Promise<ResolvedDesignWorkspace> {
    try {
      const parsed = designWorkspaceReceiptSchema.safeParse(value);
      if (!parsed.success)
        throw new ContractValidationError(
          "Недопустимая квитанция файловой версии.",
        );
      const receipt = parsed.data;
      const repository = await this.repository(false);
      const binding = await repository.binding(receipt, false);
      const directory = join(binding.revisions, receipt.revision.revisionId);
      if (!(await exists(directory)))
        throw new DesignWorkspaceError("NOT_FOUND");
      const manifest = await this.files.verify(directory, receipt);
      return {
        directory,
        manifest,
        receipt: await repository.receipt(binding, receipt, false),
      };
    } catch (error) {
      return this.fail(error);
    }
  }

  /** Читается только перечисленный в exact manifest файл, а не произвольный путь рабочей копии. */
  async readFile(value: unknown, path: string): Promise<DesignFile> {
    try {
      const resolved = await this.resolve(value);
      const file = resolved.manifest.files.find((file) => file.path === path);
      if (!file) throw new DesignWorkspaceError("NOT_FOUND");
      const bytes = await readBoundedFile(
        join(resolved.directory, file.path),
        file.bytes,
      );
      if (
        bytes.length !== file.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256
      )
        throw new DesignWorkspaceError("INTEGRITY");
      return { path: file.path, content: bytes.toString("utf8") };
    } catch (error) {
      return this.fail(error);
    }
  }
}

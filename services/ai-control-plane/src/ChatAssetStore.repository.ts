/**
 * @file services/ai-control-plane/src/ChatAssetStore.repository.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Хранит приватные вложения вне checkout и связывает их неизменяемо с одним run.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_PENDING_ATTACHMENT_TTL_MS,
  normalizeChatAttachmentMime,
} from "@realize/ai-contracts";
import type {
  ChatAssetMetadata,
  ChatAssetReference,
} from "@realize/ai-contracts";
import type { ChatAssetUpload, ChatAssetContent } from "./ChatAssetStore.types";
import { readPrivateAssetFile } from "./readPrivateAssetFile.service";
import { parseStoredChatAsset } from "./parseStoredChatAsset.validator";
import { validateChatAsset } from "./validateChatAsset.validator";

/** Каталог задаётся оператором; отсутствующая конфигурация отключает загрузки, не чат. */
export class ChatAssetStore {
  private readonly locks = new Map<string, Promise<unknown>>();
  constructor(
    private readonly configuredRoot: string | undefined,
    private readonly workspaceRoot: string,
  ) {}

  async available(): Promise<boolean> {
    try {
      await this.root();
      return true;
    } catch {
      return false;
    }
  }

  private async root(): Promise<string> {
    if (!this.configuredRoot || !isAbsolute(this.configuredRoot))
      throw new Error("Private chat attachment storage is not configured.");
    const configured = resolve(this.configuredRoot);
    const workspace = await realpath(this.workspaceRoot);
    const workspaceFromStorage = relative(configured, workspace);
    if (
      !workspaceFromStorage.startsWith(`..${sep}`) ||
      configured === workspace ||
      configured.startsWith(workspace + sep)
    )
      throw new Error("Chat attachment storage must be outside the checkout.");
    await mkdir(configured, { recursive: true, mode: 0o700 });
    if (
      (await realpath(configured)) !== configured ||
      !(await lstat(configured)).isDirectory()
    )
      throw new Error("Chat attachment storage must not use symlinks.");
    await chmod(configured, 0o700);
    return configured;
  }

  private async locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }

  private async directory(id: string): Promise<string> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid attachment ID.");
    const target = join(await this.root(), id);
    if ((await realpath(target)) !== target)
      throw new Error("Invalid attachment path.");
    return target;
  }

  async upload(input: ChatAssetUpload): Promise<ChatAssetMetadata> {
    await this.cleanup();
    if (
      !input.name ||
      input.name.length > 200 ||
      /[\x00-\x1f/\\]/.test(input.name)
    )
      throw new Error("Invalid attachment filename.");
    if (normalizeChatAttachmentMime(input.name) !== input.mimeType)
      throw new Error("Unsupported attachment format.");
    const id = randomUUID();
    const root = await this.root();
    const temporary = join(root, `pending-${id}`);
    await mkdir(temporary, { mode: 0o700 });
    try {
      const target = join(temporary, "data");
      const handle = await open(target, "wx", 0o600);
      let size = 0;
      const limit = input.mimeType.startsWith("image/")
        ? CHAT_ATTACHMENT_LIMITS.maxImageBytes
        : CHAT_ATTACHMENT_LIMITS.maxTextBytes;
      try {
        for await (const chunk of input.chunks) {
          size += chunk.byteLength;
          if (size > limit)
            throw new Error("Attachment exceeds its size limit.");
          await handle.writeFile(chunk);
        }
      } finally {
        await handle.close();
      }
      const data = await readFile(target);
      const kind = await validateChatAsset(data, input.mimeType);
      const metadata: ChatAssetMetadata = {
        id,
        name: input.name,
        mimeType: input.mimeType,
        kind,
        size,
        sha256: createHash("sha256").update(data).digest("hex"),
        createdAt: new Date().toISOString(),
      };
      await writeFile(
        join(temporary, "metadata.json"),
        JSON.stringify(metadata),
        { mode: 0o600, flag: "wx" },
      );
      await rename(temporary, join(root, id));
      return metadata;
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  async metadata(id: string, allowExpired = false): Promise<ChatAssetMetadata> {
    const directory = await this.directory(id);
    const metadata = parseStoredChatAsset(
      JSON.parse(
        (
          await readPrivateAssetFile(join(directory, "metadata.json"), 4096)
        ).toString("utf8"),
      ),
      id,
    );
    let runID: string | undefined;
    try {
      runID = (
        await readPrivateAssetFile(join(directory, "claim"), 128)
      ).toString("utf8");
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(runID))
        throw new Error("Invalid attachment claim.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (
      !allowExpired &&
      !runID &&
      Date.now() - Date.parse(metadata.createdAt) >
        CHAT_PENDING_ATTACHMENT_TTL_MS
    )
      throw new Error("Attachment expired. Upload it again.");
    return { ...metadata, runID };
  }

  async read(id: string): Promise<ChatAssetContent> {
    const metadata = await this.metadata(id);
    const target = join(await this.directory(id), "data");
    const data = await readPrivateAssetFile(target, metadata.size);
    if (createHash("sha256").update(data).digest("hex") !== metadata.sha256)
      throw new Error("Stored attachment integrity check failed.");
    return { metadata, data };
  }

  async claim(reference: ChatAssetReference, runID: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(runID))
      throw new Error("Invalid run ID.");
    await this.locked(reference.id, async () => {
      const { metadata } = await this.read(reference.id);
      if (
        metadata.sha256 !== reference.sha256 ||
        (metadata.runID && metadata.runID !== runID)
      )
        throw new Error("Attachment is already linked or changed.");
      if (!metadata.runID) {
        try {
          await writeFile(
            join(await this.directory(reference.id), "claim"),
            runID,
            { flag: "wx", mode: 0o600 },
          );
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== "EEXIST" ||
            (await this.metadata(reference.id)).runID !== runID
          )
            throw error;
        }
      }
    });
  }

  /** Уже отправленное вложение не удаляется клиентским действием. */
  async remove(id: string): Promise<void> {
    await this.locked(id, async () => {
      let metadata: ChatAssetMetadata;
      try {
        metadata = await this.metadata(id, true);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      if (metadata.runID) throw new Error("Linked attachments are immutable.");
      await rm(await this.directory(id), { recursive: true, force: true });
    });
  }

  /** Удаляет только неотправленные загрузки старше суток, включая прерванные relay. */
  async cleanup(): Promise<void> {
    const root = await this.root();
    for (const name of await readdir(root)) {
      if (!/^(?:pending-)?[a-f0-9-]{36}$/.test(name)) continue;
      await this.locked(name, async () => {
        const target = join(root, name);
        const stats = await lstat(target).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
          throw error;
        });
        if (
          !stats ||
          stats.isSymbolicLink() ||
          !stats.isDirectory() ||
          Date.now() - stats.mtimeMs < CHAT_PENDING_ATTACHMENT_TTL_MS
        )
          return;
        try {
          await lstat(join(target, "claim"));
          return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        await rm(target, { recursive: true, force: true });
      });
    }
  }
}

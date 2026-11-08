/**
 * @file packages/engineering-runtime/src/content/ImmutableContent.repository.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Сохраняет content и request identity одной immutable no-replace публикацией.
 * @see documentation/architecture/engineering-operations.md
 */
import {
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import type { PrepareContentCommand } from "../contracts/EngineeringCommand.types.ts";
import { canonicalEngineeringJson } from "../contracts/canonicalEngineeringJson.util.ts";
import { prepareContentCommandSchema } from "../contracts/engineeringCommands.schemas.ts";
import { ENGINEERING_BOUNDS } from "../contracts/engineeringBounds.constants.ts";
import {
  engineeringSha256Schema,
  engineeringUuidSchema,
} from "../contracts/engineeringPrimitives.schemas.ts";
import { sha256Bytes } from "../contracts/hashEngineeringValue.util.ts";
import { engineeringIdentity } from "../runtime/engineeringIdentity.util.ts";
import {
  EngineeringFailure,
  failure,
} from "../runtime/EngineeringFailure.error.ts";
import type { PrivateFilesystem } from "../filesystem/PrivateFilesystem.adapter.ts";
import { descriptorPath } from "../filesystem/DescriptorFilesystem.adapter.ts";
import {
  contentIdentitySchema,
  immutableContentRecordSchema,
} from "./engineeringContent.schemas.ts";
import {
  CONTENT_RECORD_MAX_BYTES,
  CONTENT_TTL_MS,
} from "./engineeringContent.constants.ts";
import { hashContentCommand } from "./hashContentCommand.util.ts";
import { mapPreparedContent } from "./mapPreparedContent.mapper.ts";
import type {
  ContentIdentity,
  ContentReadResult,
  EngineeringContentPort,
  ImmutableContentRecord,
  PreparedContentView,
} from "./EngineeringContent.types.ts";

function contentFailure(error: unknown): never {
  if (error instanceof EngineeringFailure) throw error;
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "UNSUPPORTED" || code === "ELOOP" || code === "ENOTDIR")
    return failure(
      "UNSUPPORTED",
      "Private content содержит неподдержанный объект.",
    );
  if (code === "CONFLICT" || code === "ENOENT")
    return failure("CONFLICT", "Private content namespace изменился.");
  if (code === "LIMIT_EXCEEDED" || code === "ENOSPC" || code === "EDQUOT")
    return failure("LIMIT_EXCEEDED", "Private content исчерпал квоту.");
  return failure(
    "INTERNAL_ERROR",
    "Не удалось выполнить private content операцию.",
  );
}

/** Caller держит workspace lease; crash оставляет только bounded private temp, без live checkout writes. */
export class ImmutableContentRepository implements EngineeringContentPort {
  private readonly fd: number;
  private readonly directoryIdentity: { dev: bigint; ino: bigint };
  private closed = false;

  constructor(
    private readonly storage: PrivateFilesystem,
    private readonly targetId: string,
    private readonly now: () => number = Date.now,
  ) {
    if (!engineeringUuidSchema.safeParse(targetId).success)
      failure("INVALID_INPUT", "Некорректный content target binding.");
    try {
      this.fd = storage.ensureDirectory("content");
    } catch (error) {
      contentFailure(error);
    }
    try {
      const stat = fstatSync(this.fd, { bigint: true });
      this.directoryIdentity = { dev: stat.dev, ino: stat.ino };
      this.assertCurrent();
    } catch (error) {
      closeSync(this.fd);
      contentFailure(error);
    }
  }

  private assertCurrent(): void {
    if (this.closed) failure("CONFLICT", "Content repository уже закрыт.");
    this.storage.assertCurrent();
    const named = lstatSync(descriptorPath(this.storage.fd, "content"), {
      bigint: true,
    });
    const held = fstatSync(this.fd, { bigint: true });
    if (
      !named.isDirectory() ||
      named.dev !== this.directoryIdentity.dev ||
      named.ino !== this.directoryIdentity.ino ||
      held.dev !== named.dev ||
      held.ino !== named.ino ||
      held.uid !== BigInt(process.getuid!()) ||
      (held.mode & 0o7777n) !== 0o700n
    )
      failure("CONFLICT", "Content directory binding изменился.");
    this.storage.native.inspectFd(this.fd);
  }

  private timestamp(): number {
    const value = this.now();
    if (
      !Number.isSafeInteger(value) ||
      !Number.isFinite(new Date(value + CONTENT_TTL_MS).getTime())
    )
      failure("INTERNAL_ERROR", "Content clock недоступен.");
    return value;
  }

  private load(
    ref: string,
  ): { record: ImmutableContentRecord; bytes: Buffer } | null {
    if (!engineeringUuidSchema.safeParse(ref).success)
      failure("INVALID_INPUT", "Некорректный contentRef.");
    this.assertCurrent();
    const path = descriptorPath(this.fd, `${ref}.json`);
    let fd: number;
    try {
      fd = openSync(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.assertCurrent();
        return null;
      }
      return contentFailure(error);
    }
    try {
      const before = fstatSync(fd, { bigint: true });
      if (
        !before.isFile() ||
        before.nlink !== 1n ||
        before.uid !== BigInt(process.getuid!()) ||
        (before.mode & 0o7777n) !== 0o600n ||
        before.size <= 0n ||
        before.size > BigInt(CONTENT_RECORD_MAX_BYTES)
      )
        failure(
          "CONFLICT",
          "Content storage повреждён или превышает byte limit.",
        );
      this.storage.native.inspectFd(fd);
      const buffer = Buffer.alloc(Number(before.size) + 1);
      let used = 0;
      while (used < buffer.length) {
        const count = readSync(fd, buffer, used, buffer.length - used, used);
        if (!count) break;
        used += count;
      }
      const after = fstatSync(fd, { bigint: true });
      const named = lstatSync(path, { bigint: true });
      if (
        used !== Number(before.size) ||
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs ||
        named.dev !== before.dev ||
        named.ino !== before.ino
      )
        failure("CONFLICT", "Content изменился при чтении.");
      this.assertCurrent();
      let raw: unknown;
      try {
        raw = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            buffer.subarray(0, used),
          ),
        );
        canonicalEngineeringJson(raw, {
          maxBytes: CONTENT_RECORD_MAX_BYTES,
          maxDepth: 8,
          maxNodes: 48,
        });
      } catch {
        return failure("CONFLICT", "Private content record повреждён.");
      }
      const parsed = immutableContentRecordSchema.safeParse(raw);
      if (!parsed.success)
        return failure(
          "CONFLICT",
          "Private content record не соответствует schema.",
        );
      const record = parsed.data;
      if (
        record.view.contentRef !== ref ||
        record.targetId !== this.targetId ||
        engineeringIdentity(record.identity.key) !== ref
      )
        failure("CONFLICT", "Content identity или target binding изменились.");
      const bytes = Buffer.from(record.bytes, "base64");
      if (
        bytes.length > ENGINEERING_BOUNDS.contentBytes ||
        bytes.toString("base64") !== record.bytes ||
        bytes.length !== record.view.byteLength ||
        sha256Bytes(bytes) !== record.view.sha256
      )
        failure("CONFLICT", "Canonical bytes или SHA-256 content не совпали.");
      return { record, bytes };
    } finally {
      closeSync(fd);
    }
  }

  private replay(
    record: ImmutableContentRecord,
    identity: ContentIdentity,
  ): PreparedContentView {
    if (
      record.identity.key !== identity.key ||
      record.identity.hash !== identity.hash ||
      record.identity.principalHash !== identity.principalHash
    )
      failure(
        "CONFLICT",
        "Content requestId уже использован с другой identity или телом.",
      );
    if (Date.parse(record.view.expiresAt) <= this.timestamp())
      failure("EXPIRED", "Content request истёк; прежний key сохранён.");
    return mapPreparedContent(record.view);
  }

  prepare(
    command: PrepareContentCommand,
    identity: ContentIdentity,
  ): PreparedContentView {
    try {
      const parsedCommand = prepareContentCommandSchema.safeParse(command);
      try {
        canonicalEngineeringJson(identity, {
          maxBytes: 1024,
          maxDepth: 2,
          maxNodes: 4,
        });
      } catch {
        failure("INVALID_INPUT", "Некорректная content identity.");
      }
      const parsedIdentity = contentIdentitySchema.safeParse(identity);
      if (!parsedCommand.success || !parsedIdentity.success)
        failure("INVALID_INPUT", "Некорректная content команда или identity.");
      command = parsedCommand.data;
      identity = parsedIdentity.data;
      if (command.targetId !== this.targetId)
        failure("FORBIDDEN", "Content target недоступен.");
      if (identity.hash !== hashContentCommand(command))
        failure("INVALID_INPUT", "Content command hash не совпал.");
      const contentRef = engineeringIdentity(identity.key);
      const existing = this.load(contentRef);
      if (existing) return this.replay(existing.record, identity);
      const bytes = Buffer.from(command.bytes, "base64");
      if (sha256Bytes(bytes) !== command.sha256)
        failure("INVALID_INPUT", "SHA-256 content не совпал.");
      const view: PreparedContentView = {
        schemaVersion: 1,
        contentRef,
        byteLength: bytes.length,
        sha256: command.sha256,
        mediaType: command.mediaType,
        expiresAt: new Date(this.timestamp() + CONTENT_TTL_MS).toISOString(),
      };
      const record: ImmutableContentRecord = {
        version: 1,
        targetId: this.targetId,
        identity,
        view,
        bytes: command.bytes,
      };
      const body = Buffer.from(JSON.stringify(record));
      if (body.length > CONTENT_RECORD_MAX_BYTES)
        failure("LIMIT_EXCEEDED", "Content record превышает byte limit.");
      this.storage.assertCapacity(body.length + 4096);
      this.assertCurrent();
      const temporary = `${randomUUID()}.tmp`;
      const path = descriptorPath(this.fd, temporary);
      const fd = openSync(
        path,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      let staged: { dev: bigint; ino: bigint } | null = null;
      try {
        try {
          staged = fstatSync(fd, { bigint: true });
          writeFileSync(fd, body);
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        this.assertCurrent();
        this.storage.assertCapacity(0);
        try {
          this.storage.native.renameNoReplace(
            this.fd,
            temporary,
            this.fd,
            `${contentRef}.json`,
          );
        } catch (error) {
          // Другой writer мог опубликовать этот же key; publication также могла пройти до потери ответа.
          const winner = this.load(contentRef);
          if (!winner) throw error;
          fsyncSync(this.fd);
          return this.replay(winner.record, identity);
        }
        fsyncSync(this.fd);
        const published = this.load(contentRef);
        if (!published)
          failure("CONFLICT", "Опубликованный content недоступен.");
        return this.replay(published.record, identity);
      } finally {
        // Удаляется только собственный ещё не опубликованный staging inode; неизвестные файлы сохраняются.
        try {
          const remaining = lstatSync(path, { bigint: true });
          if (
            staged &&
            remaining.dev === staged.dev &&
            remaining.ino === staged.ino
          ) {
            unlinkSync(path);
            fsyncSync(this.fd);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    } catch (error) {
      return contentFailure(error);
    }
  }

  read(ref: string, principalHash: string): ContentReadResult {
    try {
      if (!engineeringSha256Schema.safeParse(principalHash).success)
        failure("INVALID_INPUT", "Некорректная content principal identity.");
      const value = this.load(ref);
      if (!value) failure("NOT_FOUND", "Content не найден.");
      if (value.record.identity.principalHash !== principalHash)
        failure("FORBIDDEN", "Content принадлежит другому субъекту.");
      if (Date.parse(value.record.view.expiresAt) <= this.timestamp())
        failure("EXPIRED", "Content истёк до планирования.");
      return {
        bytes: Uint8Array.from(value.bytes),
        view: mapPreparedContent(value.record.view),
      };
    } catch (error) {
      return contentFailure(error);
    }
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      closeSync(this.fd);
    }
  }
}

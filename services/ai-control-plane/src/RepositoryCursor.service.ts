/**
 * @file services/ai-control-plane/src/RepositoryCursor.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Подписывает stateless курсоры чтения без сохранения содержимого снимков.
 * @see documentation/specifications/internal-mcp.md
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { RepositoryReadError } from "./RepositoryRead.error";
import type { RepositoryCursorBinding } from "./RepositoryCursor.types";

export const hashRepositorySnapshot = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Ключ живёт только в процессе; restart делает старые курсоры недействительными. */
export class RepositoryCursorService {
  private readonly key = randomBytes(32);
  constructor(private readonly now: () => number = Date.now) {}

  create(binding: RepositoryCursorBinding, offset: number): string {
    const body = Buffer.from(
      JSON.stringify({
        binding: hashRepositorySnapshot([
          binding.principal,
          binding.policy,
          binding.query,
        ]),
        snapshot: binding.snapshot,
        offset,
        expires: this.now() + 600_000,
      }),
    ).toString("base64url");
    return `${body}.${this.sign(body).toString("base64url")}`;
  }

  resolve(
    cursor: string | undefined,
    binding: RepositoryCursorBinding,
  ): number {
    if (!cursor) return 0;
    const invalid = () =>
      new RepositoryReadError(
        "INVALID_CURSOR",
        "Продолжение недействительно; начните запрос заново.",
      );
    if (
      cursor.length > 2048 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor)
    )
      throw invalid();
    const [body, signature] = cursor.split(".");
    const supplied = Buffer.from(signature, "base64url");
    const expected = this.sign(body);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw invalid();
    let value;
    try {
      value = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      throw invalid();
    }
    if (
      !value ||
      value.binding !==
        hashRepositorySnapshot([
          binding.principal,
          binding.policy,
          binding.query,
        ]) ||
      !Number.isSafeInteger(value.offset) ||
      value.offset < 0 ||
      !Number.isSafeInteger(value.expires) ||
      value.expires <= this.now()
    )
      throw invalid();
    if (value.snapshot !== binding.snapshot)
      throw new RepositoryReadError(
        "CONFLICT",
        "Снимок изменился; начните запрос заново.",
      );
    return value.offset;
  }

  private sign(value: string): Buffer {
    return createHmac("sha256", this.key).update(value).digest();
  }
}

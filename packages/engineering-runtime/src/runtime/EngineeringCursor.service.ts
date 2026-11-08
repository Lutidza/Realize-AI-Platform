/**
 * @file packages/engineering-runtime/src/runtime/EngineeringCursor.service.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Подписывает короткоживущие cursors, привязанные к субъекту и выборке.
 * @see documentation/architecture/engineering-operations.md
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { failure } from "./EngineeringFailure.error.ts";

/** Секрет epoch находится только в private store; cursor не является допуском. */
export class EngineeringCursor {
  constructor(
    private readonly key: string,
    private readonly principal: string,
    private readonly now: () => number,
  ) {}
  private sign(body: string): Buffer {
    return createHmac("sha256", this.key).update(body).digest();
  }
  issue(scope: string, offset: number): string {
    const body = Buffer.from(
      JSON.stringify({
        scope,
        offset,
        principal: this.principal,
        expires: this.now() + 600_000,
      }),
    ).toString("base64url");
    return `${body}.${this.sign(body).toString("base64url")}`;
  }
  read(value: string | null, scope: string): number {
    if (value === null) return 0;
    const [body, signature, extra] = value.split(".");
    if (!body || !signature || extra)
      return failure("INVALID_INPUT", "Некорректный cursor.");
    const given = Buffer.from(signature, "base64url");
    if (given.length !== 32 || !timingSafeEqual(given, this.sign(body)))
      return failure("INVALID_INPUT", "Некорректный cursor.");
    let data;
    try {
      data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      return failure("INVALID_INPUT", "Некорректный cursor.");
    }
    if (
      data.scope !== scope ||
      data.principal !== this.principal ||
      !Number.isSafeInteger(data.offset) ||
      data.offset < 0
    )
      return failure(
        "EXPIRED",
        "Cursor принадлежит другой области доступа: требуется resync snapshot.",
      );
    if (data.expires <= this.now())
      return failure("EXPIRED", "Срок cursor истёк.");
    return data.offset;
  }
}

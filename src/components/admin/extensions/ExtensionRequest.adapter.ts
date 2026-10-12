/**
 * @file src/components/admin/extensions/ExtensionRequest.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет общий API envelope и доставляет строгие DTO операций оболочки и оформления.
 */
import { z } from "zod";
import { ExtensionManagerClientError } from "./ExtensionManagerClient.error";

const failureEnvelope = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

/** Fetch dependency позволяет проверить wire contract без приложения, сессии и БД. */
export class ExtensionRequest {
  constructor(
    private readonly requestFetch: typeof fetch = (...args) => fetch(...args),
  ) {}
  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options?: RequestInit,
  ): Promise<T> {
    const response = await this.requestFetch(`/api/realize-extensions${path}`, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ExtensionManagerClientError(
        "Ответ сервера не удалось подтвердить. Повторите запрос.",
        "INVALID_RESPONSE",
        response.status,
        "unknown",
      );
    }
    const failure = failureEnvelope.safeParse(body);
    if (!response.ok && failure.success)
      throw new ExtensionManagerClientError(
        failure.data.error.message,
        failure.data.error.code,
        response.status,
        response.status < 500 ? "rejected" : "unknown",
      );
    const result = z
      .strictObject({ ok: z.literal(true), data: schema })
      .safeParse(body);
    if (!response.ok || !result.success)
      throw new ExtensionManagerClientError(
        "Сервер вернул неподтверждённый ответ. Повторите ту же операцию.",
        "INVALID_RESPONSE",
        response.status,
        "unknown",
      );
    return result.data.data;
  }
  mutation<T>(input: T, schema: z.ZodType<T>, requestId: string): RequestInit {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new ExtensionManagerClientError(
        "Параметры изменения не прошли проверку. Проверьте настройки.",
        "INVALID_INPUT",
        400,
        "rejected",
      );
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestId,
      },
      body: JSON.stringify(parsed.data),
    };
  }
}

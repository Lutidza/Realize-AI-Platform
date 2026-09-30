/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/DesignWorkshopApi.client.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Читает Workshop DTO и сохраняет ключ мутации при повторе потерянного ответа.
 * @see documentation/specifications/design-workshop.md
 */

import {
  designMutationReceiptSchema,
  designPreviewJobSchema,
  type DesignPreviewRequest,
  type APIResponse,
  type DesignMutationReceiptDto,
} from "@realize/ai-contracts";
import { WORKSHOP_API_PATH } from "./designWorkshopClient.constants";

export class WorkshopRequestError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "WorkshopRequestError";
  }
}

/** Ключ живёт до окончания UI-операции: потерянный ответ не создаёт второй проект или версию. */
export class DesignWorkshopApi {
  private mutations = new Map<string, string>();
  constructor(
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async read<T>(path = "", signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { signal });
  }

  async mutate(
    path: string,
    value: unknown,
  ): Promise<DesignMutationReceiptDto> {
    return designMutationReceiptSchema.parse(await this.write(path, value));
  }

  async startPreview(projectId: string, input: DesignPreviewRequest) {
    return designPreviewJobSchema.parse(
      await this.write(`/${projectId}/previews`, input),
    );
  }

  async cancelPreview(projectId: string, jobId: string) {
    return designPreviewJobSchema.parse(
      await this.write(`/${projectId}/previews/${jobId}/cancel`, {}),
    );
  }

  private async write(path: string, value: unknown): Promise<unknown> {
    const body = JSON.stringify(value);
    const signature = path + "\n" + body;
    let key = this.mutations.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      this.mutations.set(signature, key);
    }
    const data = await this.request<unknown>(path, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    });
    return data;
  }

  /** Вызывается после успешного полного перехода UI или явного отказа от кандидата. */
  complete() {
    this.mutations.clear();
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(WORKSHOP_API_PATH + path, {
        ...init,
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", ...init.headers },
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new WorkshopRequestError(
        "Не удалось связаться с Мастерской. Ввод сохранён в этой вкладке. Повторите действие.",
      );
    }
    let envelope: APIResponse<T>;
    try {
      envelope = await response.json();
    } catch {
      throw new WorkshopRequestError(
        "Сервер вернул неполный ответ. Повторите действие.",
        response.status,
      );
    }
    if (!response.ok || !envelope.ok) {
      const message =
        response.status === 401
          ? "Сессия завершена. Войдите в админку в другой вкладке, затем повторите действие."
          : !envelope.ok
            ? envelope.error.message
            : "Не удалось выполнить действие.";
      throw new WorkshopRequestError(message, response.status);
    }
    return envelope.data;
  }
}

export function workshopErrorMessage(error: unknown): string {
  return error instanceof WorkshopRequestError
    ? error.message
    : "Не удалось выполнить действие. Повторите попытку.";
}

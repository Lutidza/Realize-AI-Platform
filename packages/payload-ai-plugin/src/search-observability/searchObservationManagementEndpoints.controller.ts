/**
 * @file packages/payload-ai-plugin/src/search-observability/searchObservationManagementEndpoints.controller.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Авторизует просмотр состояния, настройку хранения и подтверждённую очистку диагностики.
 */
import type { Endpoint } from "payload";
import {
  searchObservationSettingsUpdateSchema,
  searchObservationCleanupModeSchema,
  searchObservationCleanupRequestSchema,
} from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { SearchObservationDatabase } from "./SearchObservationStore.types";
import { DEFAULT_API_ROUTE } from "../constants";
import { requireAIConfigurationManager } from "../endpoints/access";
import { withHandler, idempotencyKeyFor } from "../endpoints/request";
import { EndpointError, success } from "../endpoints/http";
import { readBoundedJsonBody } from "../endpoints/readBoundedJsonBody.adapter";
import { SearchObservationControl } from "./SearchObservationControl.repository";

/** Произвольная ошибка PostgreSQL/валидации сохранённого state не пересекает API boundary. */
async function managementOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof EndpointError) throw error;
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Управление диагностикой временно недоступно. Повторите действие.",
      503,
    );
  }
}

export function createSearchObservationManagementEndpoints(
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] {
  const base = `${DEFAULT_API_ROUTE}/search-observations`;
  return [
    {
      path: `${base}/control`,
      method: "get",
      handler: withHandler(async (req, correlationID) => {
        await requireAIConfigurationManager(req, options);
        return success(
          await managementOperation(() =>
            new SearchObservationControl(
              req.payload.db as SearchObservationDatabase,
            ).get(),
          ),
          correlationID,
        );
      }),
    },
    {
      path: `${base}/settings`,
      method: "post",
      handler: withHandler(async (req, correlationID) => {
        const actor = await requireAIConfigurationManager(req, options);
        const requestID = idempotencyKeyFor(req);
        const input = searchObservationSettingsUpdateSchema.safeParse(
          await readBoundedJsonBody(req, 4096),
        );
        if (!input.success)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Проверьте срок хранения, предел записей и интервал очистки.",
            400,
          );
        return success(
          await managementOperation(() =>
            new SearchObservationControl(
              req.payload.db as SearchObservationDatabase,
            ).update(input.data, requestID, String(actor.id)),
          ),
          correlationID,
        );
      }),
    },
    {
      path: `${base}/cleanup-preview`,
      method: "get",
      handler: withHandler(async (req, correlationID) => {
        await requireAIConfigurationManager(req, options);
        const params = new URL(req.url ?? "http://localhost").searchParams;
        const mode = searchObservationCleanupModeSchema.safeParse(
          params.get("mode"),
        );
        if (
          !mode.success ||
          [...params.keys()].some((key) => key !== "mode") ||
          params.getAll("mode").length !== 1
        )
          throw new EndpointError(
            "INVALID_REQUEST",
            "Выберите очистку устаревших записей или истории.",
            400,
          );
        return success(
          await managementOperation(() =>
            new SearchObservationControl(
              req.payload.db as SearchObservationDatabase,
            ).preview(mode.data),
          ),
          correlationID,
        );
      }),
    },
    {
      path: `${base}/cleanup`,
      method: "post",
      handler: withHandler(async (req, correlationID) => {
        const actor = await requireAIConfigurationManager(req, options);
        const requestID = idempotencyKeyFor(req);
        const input = searchObservationCleanupRequestSchema.safeParse(
          await readBoundedJsonBody(req, 4096),
        );
        if (!input.success)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Сначала получите предварительный расчёт очистки.",
            400,
          );
        return success(
          await managementOperation(() =>
            new SearchObservationControl(
              req.payload.db as SearchObservationDatabase,
            ).clear(input.data.preview, requestID, String(actor.id)),
          ),
          correlationID,
        );
      }),
    },
  ];
}

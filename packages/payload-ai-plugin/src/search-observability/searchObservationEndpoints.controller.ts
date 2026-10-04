/**
 * @file packages/payload-ai-plugin/src/search-observability/searchObservationEndpoints.controller.ts
 * @version 1.3.0
 * @date 2026-09-30
 * @description Авторизует историю и строго ограниченный импорт диагностики CLI.
 */
import type { SearchObservationDatabase } from "./SearchObservationStore.types";
import type { Endpoint } from "payload";
import {
  searchObservationSchema,
  searchObservationQuerySchema,
  searchQualityImportSchema,
} from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DEFAULT_API_ROUTE } from "../constants";
import { requireAIConfigurationManager } from "../endpoints/access";
import { withHandler, idempotencyKeyFor } from "../endpoints/request";
import { EndpointError, success } from "../endpoints/http";
import { readBoundedJsonBody } from "../endpoints/readBoundedJsonBody.adapter";
import { SearchObservationStore } from "./SearchObservationStore.repository";
import { createSearchObservationManagementEndpoints } from "./searchObservationManagementEndpoints.controller";
import { SearchQualityStore } from "./SearchQualityStore.repository";

export function createSearchObservationEndpoints(
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] {
  return [
    ...createSearchObservationManagementEndpoints(options),
    {
      path: `${DEFAULT_API_ROUTE}/search-observations/quality-import`,
      method: "post",
      handler: withHandler(async (req, correlationID) => {
        await requireAIConfigurationManager(req, options);
        idempotencyKeyFor(req);
        const input = searchQualityImportSchema.safeParse(
          await readBoundedJsonBody(req, 32768),
        );
        if (!input.success)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Ожидаются контрольные summaries с corpus/source versions и фазой кеша.",
            400,
          );
        try {
          return success(
            await new SearchQualityStore(
              req.payload.db as SearchObservationDatabase,
            ).append(input.data),
            correlationID,
          );
        } catch (error) {
          if (error instanceof EndpointError) throw error;
          throw new EndpointError(
            "INTEGRATION_UNAVAILABLE",
            "Хранилище контрольных замеров недоступно. Повторите тот же отчёт.",
            503,
          );
        }
      }),
    },
    {
      path: `${DEFAULT_API_ROUTE}/search-observations`,
      method: "get",
      handler: withHandler(async (req, correlationID) => {
        await requireAIConfigurationManager(req, options);
        const params = new URL(req.url ?? "http://localhost").searchParams;
        const query = searchObservationQuerySchema.safeParse(
          Object.fromEntries(params),
        );
        if (
          !query.success ||
          [...params.keys()].some((key) => params.getAll(key).length !== 1)
        )
          throw new EndpointError(
            "INVALID_REQUEST",
            "Некорректные фильтры диагностики.",
            400,
          );
        try {
          return success(
            await new SearchObservationStore(
              req.payload.db as SearchObservationDatabase,
            ).list(query.data),
            correlationID,
          );
        } catch (error) {
          if (error instanceof EndpointError) throw error;
          throw new EndpointError(
            "INTEGRATION_UNAVAILABLE",
            "Хранилище диагностики поиска недоступно.",
            503,
          );
        }
      }),
    },
    {
      path: `${DEFAULT_API_ROUTE}/search-observations/import`,
      method: "post",
      handler: withHandler(async (req, correlationID) => {
        await requireAIConfigurationManager(req, options);
        const key = idempotencyKeyFor(req);
        const event = searchObservationSchema.safeParse(
          await readBoundedJsonBody(req, 8192),
        );
        if (
          !event.success ||
          event.data.source !== "cli" ||
          key !== event.data.eventID
        )
          throw new EndpointError(
            "INVALID_REQUEST",
            "Ожидается диагностический JSON CLI; ключ повторения должен совпадать с eventID.",
            400,
          );
        try {
          return success(
            {
              inserted: await new SearchObservationStore(
                req.payload.db as SearchObservationDatabase,
              ).append([event.data], "import"),
            },
            correlationID,
          );
        } catch (error) {
          if (error instanceof EndpointError) throw error;
          throw new EndpointError(
            "INTEGRATION_UNAVAILABLE",
            "Импорт недоступен. Повторите тот же файл.",
            503,
          );
        }
      }),
    },
  ];
}

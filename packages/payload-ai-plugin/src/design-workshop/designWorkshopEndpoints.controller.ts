/**
 * @file packages/payload-ai-plugin/src/design-workshop/designWorkshopEndpoints.controller.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Адаптирует authenticated Admin HTTP к общему сервису дизайна без зависимости от Codex runtime.
 * @see documentation/specifications/design-workshop.md
 */
import type { Endpoint, PayloadRequest } from "payload";
import {
  ContractValidationError,
  DESIGN_WORKSHOP_LIMITS,
} from "@realize/ai-contracts";
import { DEFAULT_API_ROUTE } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { EndpointError, success } from "../endpoints/http";
import { withHandler } from "../endpoints/request";
import { readBoundedJsonBody } from "../endpoints/readBoundedJsonBody.adapter";
import { DesignWorkshop } from "./DesignWorkshop.service";
import { DesignPreview } from "./DesignPreview.service";

export function createDesignWorkshopEndpoints(
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] {
  const endpoint = (
    path: string,
    method: "get" | "post",
    work: (workshop: DesignWorkshop, req: PayloadRequest) => Promise<unknown>,
  ): Endpoint => ({
    path: `${DEFAULT_API_ROUTE}/workshop/projects${path}`,
    method,
    handler: withHandler(async (req, correlationId) => {
      const workshop = new DesignWorkshop(req, options);
      try {
        // До чтения потенциально большого body; facade также проверяет права для других адаптеров.
        await workshop.authorize();
        const result = await work(workshop, req);
        return result instanceof Response
          ? result
          : success(result, correlationId);
      } catch (error) {
        if (
          error instanceof EndpointError ||
          error instanceof ContractValidationError
        )
          throw error;
        // SQL/driver ошибки и сохранённое содержимое не попадают в публичный ответ или общий logger.
        throw new EndpointError(
          "INTERNAL_ERROR",
          "Хранилище Мастерской недоступно. Повторите запрос с тем же Idempotency-Key.",
          503,
        );
      }
    }),
  });
  const id = (req: PayloadRequest, key: string) =>
    String(req.routeParams?.[key] ?? "");
  const body = (req: PayloadRequest) =>
    readBoundedJsonBody(req, DESIGN_WORKSHOP_LIMITS.requestBytes);
  const query = (req: PayloadRequest) =>
    Object.fromEntries(new URL(req.url ?? "http://localhost").searchParams);
  const preview = (req: PayloadRequest) => new DesignPreview(req, options);
  return [
    endpoint("/:projectId/previews", "post", async (_, req) =>
      preview(req).start(id(req, "projectId"), await body(req)),
    ),
    endpoint("/:projectId/previews", "get", (_, req) =>
      preview(req).list(id(req, "projectId")),
    ),
    endpoint("/:projectId/previews/:jobId", "get", (_, req) =>
      preview(req).get(id(req, "projectId"), id(req, "jobId")),
    ),
    endpoint("/:projectId/previews/:jobId/cancel", "post", async (_, req) =>
      preview(req).cancel(
        id(req, "projectId"),
        id(req, "jobId"),
        await body(req),
      ),
    ),
    endpoint(
      "/:projectId/previews/:jobId/images/:width",
      "get",
      async (_, req) =>
        new Response(
          new Uint8Array(
            await preview(req).image(
              id(req, "projectId"),
              id(req, "jobId"),
              id(req, "width"),
            ),
          ),
          {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Cross-Origin-Resource-Policy": "same-origin",
            },
          },
        ),
    ),
    endpoint("", "get", (workshop, req) => workshop.list(query(req))),
    endpoint("", "post", async (workshop, req) =>
      workshop.create(await body(req)),
    ),
    endpoint("/:projectId", "get", (workshop, req) =>
      workshop.project(id(req, "projectId")),
    ),
    endpoint("/:projectId/revisions", "get", (workshop, req) =>
      workshop.revisions(id(req, "projectId"), query(req)),
    ),
    endpoint("/:projectId/revisions/:revisionId", "get", (workshop, req) =>
      workshop.revision(id(req, "projectId"), id(req, "revisionId")),
    ),
    endpoint("/:projectId/changes/prepare", "post", async (workshop, req) =>
      workshop.prepare(id(req, "projectId"), await body(req)),
    ),
    endpoint("/:projectId/changes/:changeId", "get", (workshop, req) =>
      workshop.change(id(req, "projectId"), id(req, "changeId")),
    ),
    endpoint(
      "/:projectId/changes/:changeId/apply",
      "post",
      async (workshop, req) =>
        workshop.apply(
          id(req, "projectId"),
          id(req, "changeId"),
          await body(req),
        ),
    ),
  ];
}

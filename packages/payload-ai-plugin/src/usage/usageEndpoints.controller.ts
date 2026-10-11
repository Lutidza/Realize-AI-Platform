/**
 * @file packages/payload-ai-plugin/src/usage/usageEndpoints.controller.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Регистрирует раздельные API аналитики, клиентского бюджета и owner-only тарифов/сверки.
 */
import { z } from "zod";
import type { Endpoint } from "payload";
import {
  usageBudgetPolicySchema,
  usageQuerySchema,
  usageReconciliationSchema,
  usagePriceSchema,
  usageAbandonSchema,
} from "@realize/ai-contracts";
import { createUsagePrice } from "@realize/change-engine";
import { DEFAULT_API_ROUTE } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { UsageDatabase } from "./UsageStore.types";
import { requireUsageAccess } from "./requireUsageAccess.service";
import { withHandler, idempotencyKeyFor } from "../endpoints/request";
import { readBoundedJsonBody } from "../endpoints/readBoundedJsonBody.adapter";
import { EndpointError, success } from "../endpoints/http";
import { UsageDashboardRepository } from "./UsageDashboard.repository";
import { UsageBudgetsRepository } from "./UsageBudgets.repository";
import { UsagePricingRepository } from "./UsagePricing.repository";
import { UsageLedgerRepository } from "./UsageLedger.repository";
import { usageError } from "./usageError.mapper";

export function createUsageEndpoints(
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] {
  const endpoints: Endpoint[] = [];
  for (const platform of [false, true]) {
    const path = `${DEFAULT_API_ROUTE}/usage${platform ? "/platform" : ""}`;
    endpoints.push({
      path,
      method: "get",
      handler: withHandler(async (req, correlationId) => {
        const scope = await requireUsageAccess(req, options.access, platform);
        try {
          const params = new URL(req.url ?? "http://localhost").searchParams;
          if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
            throw new EndpointError(
              "INVALID_REQUEST",
              "Повтор фильтра недопустим.",
              400,
            );
          return success(
            await new UsageDashboardRepository(
              req.payload.db as UsageDatabase,
            ).read(scope, usageQuerySchema.parse(Object.fromEntries(params))),
            correlationId,
          );
        } catch (error) {
          usageError(error);
        }
      }),
    });
    endpoints.push({
      path: `${path}/budget`,
      method: "post",
      handler: withHandler(async (req, correlationId) => {
        const scope = await requireUsageAccess(req, options.access, platform);
        const key = idempotencyKeyFor(req);
        try {
          const command = z
            .strictObject({
              expectedRevision: z.number().int().min(0),
              policy: usageBudgetPolicySchema,
            })
            .parse(await readBoundedJsonBody(req, 8192));
          if (
            scope.view === "installation" &&
            (command.policy.installationId !== scope.installationId ||
              command.policy.projectId !== scope.projectId ||
              command.policy.purpose !== "customer_runtime" ||
              command.policy.basis !== "customer")
          )
            throw new Error("USAGE_SCOPE_FORBIDDEN");
          const policy = await new UsageBudgetsRepository(
            req.payload.db as UsageDatabase,
          ).update({
            ...command,
            eventId: `budget:${req.user!.id}:${key}`,
            actorId: String(req.user!.id),
          });
          return success({ revision: policy.revision }, correlationId);
        } catch (error) {
          usageError(error);
        }
      }),
    });
  }
  endpoints.push({
    path: `${DEFAULT_API_ROUTE}/usage/platform/prices`,
    method: "post",
    handler: withHandler(async (req, correlationId) => {
      await requireUsageAccess(req, options.access, true);
      const key = idempotencyKeyFor(req);
      try {
        const raw = z
          .record(z.string(), z.unknown())
          .parse(await readBoundedJsonBody(req, 16384));
        if ("contentHash" in raw || "pricingId" in raw)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Идентификатор и digest тарифа назначает сервер.",
            400,
          );
        const checked = usagePriceSchema.parse({
          ...raw,
          pricingId: `price:${req.user!.id}:${key}`,
          contentHash: "0".repeat(64),
        });
        const { contentHash: _hash, ...body } = checked;
        const price = await new UsagePricingRepository(
          req.payload.db as UsageDatabase,
        ).publish({
          price: createUsagePrice(body),
          actorId: String(req.user!.id),
        });
        return success(
          { pricingId: price.pricingId, contentHash: price.contentHash },
          correlationId,
        );
      } catch (error) {
        usageError(error);
      }
    }),
  });
  endpoints.push({
    path: `${DEFAULT_API_ROUTE}/usage/platform/reconcile`,
    method: "post",
    handler: withHandler(async (req, correlationId) => {
      await requireUsageAccess(req, options.access, true);
      const key = idempotencyKeyFor(req);
      try {
        const raw = z
          .record(z.string(), z.unknown())
          .parse(await readBoundedJsonBody(req, 8192));
        if ("eventId" in raw)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Идентификатор сверки назначает сервер.",
            400,
          );
        const input = usageReconciliationSchema.parse({
          ...raw,
          eventId: `reconcile:${req.user!.id}:${key}`,
        });
        const attempt = await new UsageLedgerRepository(
          req.payload.db as UsageDatabase,
        ).reconcile({ input, actorId: String(req.user!.id) });
        return success(
          { attemptId: attempt.attemptId, revision: attempt.revision },
          correlationId,
        );
      } catch (error) {
        usageError(error);
      }
    }),
  });
  endpoints.push({
    path: `${DEFAULT_API_ROUTE}/usage/platform/abandon`,
    method: "post",
    handler: withHandler(async (req, correlationId) => {
      await requireUsageAccess(req, options.access, true);
      const key = idempotencyKeyFor(req);
      try {
        const raw = z
          .record(z.string(), z.unknown())
          .parse(await readBoundedJsonBody(req, 8192));
        if ("eventId" in raw)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Идентификатор восстановления назначает сервер.",
            400,
          );
        const input = usageAbandonSchema.parse({
          ...raw,
          eventId: `abandon:${req.user!.id}:${key}`,
        });
        const attempt = await new UsageLedgerRepository(
          req.payload.db as UsageDatabase,
        ).abandon(input, String(req.user!.id));
        return success(
          { attemptId: attempt.attemptId, revision: attempt.revision },
          correlationId,
        );
      } catch (error) {
        usageError(error);
      }
    }),
  });
  return endpoints;
}

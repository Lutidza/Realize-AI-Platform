/**
 * @file tests/int/search-observation-management.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Проверяет границы управления диагностикой, безопасный DTO и ошибки API.
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import {
  searchObservationSettingsSchema,
  SEARCH_OBSERVATION_DEFAULT_SETTINGS,
} from "@realize/ai-contracts";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { createSearchObservationManagementEndpoints } from "../../packages/payload-ai-plugin/src/search-observability/searchObservationManagementEndpoints.controller";
import { SEARCH_OBSERVATION_INITIAL_STATE } from "../../packages/payload-ai-plugin/src/search-observability/searchObservation.config";
import { searchObservationControlStateSchema } from "../../packages/payload-ai-plugin/src/search-observability/searchObservationState.schemas";
import { mapSearchObservationControl } from "../../packages/payload-ai-plugin/src/search-observability/mapSearchObservationControl.mapper";

const options = sanitizeOptions({
  access: {
    canManageAIConfiguration: () => true,
    canApproveRelease: () => false,
    canManageData: () => false,
    canManageIntegrations: () => false,
    canUseChat: () => false,
    canViewRuns: () => false,
  },
  runtime: {
    mode: "local-development",
    controlPlaneTokenEnv: "FIXTURE_CONTROL_TOKEN",
  },
});
const endpoints = createSearchObservationManagementEndpoints(options);

describe("search observation management boundaries", () => {
  it.each([
    { retentionDays: 0 },
    { retentionDays: 8 },
    { retentionDays: 1.5 },
    { capacity: 99 },
    { capacity: 10001 },
    { capacity: "100" },
    { cleanupIntervalMinutes: 0 },
    { cleanupIntervalMinutes: 61 },
    { filesystemAccess: true },
  ])("rejects settings outside supported policy: %j", (extra) => {
    expect(
      searchObservationSettingsSchema.safeParse({
        ...SEARCH_OBSERVATION_DEFAULT_SETTINGS,
        ...extra,
      }).success,
    ).toBe(false);
  });

  it("maps health and bounded actions without leaking actor IDs or request hashes", () => {
    const now = Date.now();
    const at = new Date(now).toISOString();
    const state = searchObservationControlStateSchema.parse({
      ...SEARCH_OBSERVATION_INITIAL_STATE,
      runtimes: [0, 36000, 91000, 0].map((age, index) => ({
        instanceID: randomUUID(),
        source: "cli",
        startedAt: at,
        heartbeatAt: new Date(now - age).toISOString(),
        appliedRevision: 1,
        queued: 0,
        dropped: 0,
        lastDeliveredAt: null,
        lastFailureAt: null,
        errorCode: index === 3 ? "buffer_unavailable" : null,
      })),
      actions: [
        {
          requestID: randomUUID(),
          requestHash: "a".repeat(64),
          actorID: "private-actor",
          revision: 2,
          at,
          kind: "history",
          deletedCount: 4,
        },
      ],
    });
    const result = mapSearchObservationControl(
      state,
      { count: 4, bytes: 1024, oldestAt: at },
      now,
    );
    expect(result.runtimes.map((runtime) => runtime.state)).toEqual([
      "healthy",
      "delayed",
      "offline",
      "degraded",
    ]);
    expect(result.actions[0]).not.toHaveProperty("actorID");
    expect(result.actions[0]).not.toHaveProperty("requestHash");
    expect(JSON.stringify(result)).not.toContain("private-actor");
    expect(
      searchObservationControlStateSchema.safeParse({
        ...state,
        runtimes: Array(33).fill(state.runtimes[0]),
      }).success,
    ).toBe(false);
    expect(
      searchObservationControlStateSchema.safeParse({
        ...state,
        actions: Array(21).fill(state.actions[0]),
      }).success,
    ).toBe(false);
  });

  it.each([
    ["settings", "POST", "{", 400],
    [
      "settings",
      "POST",
      JSON.stringify({
        expectedRevision: 1,
        settings: { ...SEARCH_OBSERVATION_DEFAULT_SETTINGS, capacity: 99 },
      }),
      400,
    ],
    ["settings", "POST", " ".repeat(5000), 400],
    ["cleanup", "POST", "{}", 400],
    ["cleanup-preview?mode=history&mode=expired", "GET", undefined, 400],
    ["cleanup-preview?mode=history&query=private", "GET", undefined, 400],
    ["cleanup-preview?mode=unknown", "GET", undefined, 400],
  ])(
    "rejects malformed %s before acquiring a connection",
    async (path, method, body, status) => {
      const connect = vi.fn();
      const req = Object.assign(
        new Request(`http://localhost/realize-ai/search-observations/${path}`, {
          method,
          body,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
          },
        }),
        {
          user: { id: 1 },
          payload: { db: { pool: { connect } }, logger: { error: vi.fn() } },
        },
      ) as unknown as PayloadRequest;
      const endpoint = endpoints.find((entry) =>
        entry.path.endsWith(`/${path.split("?")[0]}`),
      )!;
      const response = await endpoint.handler(req);
      expect(response.status).toBe(status);
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it("returns a safe 503 without private database details", async () => {
    const req = Object.assign(
      new Request("http://localhost/realize-ai/search-observations/control"),
      {
        user: { id: 1 },
        payload: {
          db: {
            pool: {
              connect: vi
                .fn()
                .mockRejectedValue(new Error("private-connection-string")),
            },
          },
          logger: { error: vi.fn() },
        },
      },
    ) as unknown as PayloadRequest;
    const response = await endpoints[0].handler(req);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("private-connection-string");
  });
});

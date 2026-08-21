/**
 * @file tests/e2e/health.e2e.spec.ts
 * @version 2026-08-17
 * @description Verifies browser-visible liveness and deployment health wiring.
 */

import { expect, test } from "@playwright/test";

test("liveness endpoint identifies the running service", async ({
  request,
}) => {
  const response = await request.get("/api/health/live");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    service: "realize-e-commerce",
    status: "ok",
  });
});

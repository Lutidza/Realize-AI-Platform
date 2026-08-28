/**
 * @file tests/e2e/admin-integrations.e2e.spec.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Verifies responsive Admin settings and write-only credential persistence.
 */

import type { APIResponse, IntegrationCatalogDTO } from "@realize/ai-contracts";
import { expect, test } from "@playwright/test";

import {
  provisionPayloadAdmin,
  removePayloadAdmin,
  type PayloadAdminFixture,
  withPayloadTestDatabase,
} from "./support/payloadAdmin";

const hasExistingGitHubConnection = async (): Promise<boolean> =>
  await withPayloadTestDatabase(async (database) => {
    const result = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "realize_ai_integrations"
        WHERE "connection_key" = 'github:primary'`,
    );
    return Number(result.rows[0]?.count || 0) > 0;
  });

const cleanupIntegration = async (userID: number): Promise<void> =>
  await withPayloadTestDatabase(async (database) => {
    await database.query(
      `DELETE FROM "realize_ai_integration_events" WHERE "actor_id" = $1`,
      [userID],
    );
    await database.query(
      `DELETE FROM "realize_ai_integrations"
        WHERE "connection_key" = 'github:primary' AND "created_by_id" = $1`,
      [userID],
    );
  });

test("configures GitHub in the scalable Admin integrations section", async ({
  page,
}) => {
  test.skip(
    await hasExistingGitHubConnection(),
    "Preserving an already configured primary GitHub connection.",
  );
  let admin: PayloadAdminFixture | undefined;
  const token = "integration-e2e-write-only-token-123456789";
  try {
    await page.setViewportSize({ height: 1_000, width: 1_440 });
    admin = await provisionPayloadAdmin(page.request);
    const login = await page.request.post("/api/users/login", {
      data: { email: admin.email, password: admin.password },
    });
    expect(login.ok()).toBe(true);

    await page.goto("/admin/integrations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Интеграции" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("GitHub", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByLabel("Ссылка на репозиторий")
      .fill("https://github.com/realize/example-store");
    await page.getByLabel("Personal access token").fill(token);
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Настройки сохранены")).toBeVisible();
    await expect(page.getByLabel("Personal access token")).toHaveValue("");
    await expect(page.getByText("Подключено").first()).toBeVisible();

    const updateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().endsWith("/api/realize-ai/integrations/github"),
    );
    await page.getByLabel("Название подключения").fill("GitHub магазина");
    await page.getByRole("button", { name: "Сохранить" }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(page.getByLabel("Название подключения")).toHaveValue(
      "GitHub магазина",
    );

    const stored = await withPayloadTestDatabase(async (database) => {
      const result = await database.query<{
        credential_envelope: string;
        revision: string;
        repository_slug: string;
      }>(
        `SELECT "credential_envelope", "revision"::text,
                "configuration"->>'repositorySlug' AS repository_slug
           FROM "realize_ai_integrations"
          WHERE "connection_key" = 'github:primary'`,
      );
      return result.rows[0];
    });
    expect(stored?.repository_slug).toBe("realize/example-store");
    expect(stored?.revision).toBe("2");
    expect(stored?.credential_envelope).not.toContain(token);

    const catalogResponse = await page.evaluate(async () => {
      const response = await fetch("/api/realize-ai/integrations", {
        credentials: "same-origin",
      });
      return { status: response.status, text: await response.text() };
    });
    const responseText = catalogResponse.text;
    expect(catalogResponse.status, responseText).toBe(200);
    expect(responseText).not.toContain(token);
    const envelope = JSON.parse(
      responseText,
    ) as APIResponse<IntegrationCatalogDTO>;
    expect(envelope.ok).toBe(true);
    if (envelope.ok) {
      expect(envelope.data.connections[0]).toMatchObject({
        hasCredential: true,
        provider: "github",
      });
    }

    await page.reload();
    await expect(page.getByLabel("Ссылка на репозиторий")).toHaveValue(
      "https://github.com/realize/example-store",
    );
    await expect(page.getByLabel("Personal access token")).toHaveValue("");
    await expect(page.locator("body")).not.toContainText(token);
    await page.screenshot({
      path: "documentation/reports/evidence/admin-integrations-desktop.png",
    });

    await page.setViewportSize({ height: 844, width: 390 });
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Интеграции" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "documentation/reports/evidence/admin-integrations-mobile.png",
    });

    page.once("dialog", (dialog) => dialog.accept());
    const disconnectResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith("/api/realize-ai/integrations/github"),
    );
    await page.getByRole("button", { name: "Отключить" }).click();
    expect((await disconnectResponse).status()).toBe(200);
    await expect(page.getByText("Не настроено").first()).toBeVisible();
    expect(await hasExistingGitHubConnection()).toBe(false);
  } finally {
    if (admin) {
      await cleanupIntegration(admin.id);
      await removePayloadAdmin(admin);
    }
  }
});

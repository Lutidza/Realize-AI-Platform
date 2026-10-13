/**
 * @file tests/e2e/admin-integrations.e2e.spec.ts
 * @version 1.0.2
 * @date 2026-09-30
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Проверяет каталог интеграций, навигацию к настройкам и write-only сохранение token.
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { APIResponse, IntegrationCatalogDTO } from "@realize/ai-contracts";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type {
  IntegrationRowCount,
  StoredGitHubIntegrationRow,
} from "./support/AdminIntegrationScenario.types";
import {
  provisionPayloadAdmin,
  removePayloadAdmin,
  type PayloadAdminFixture,
  withPayloadTestDatabase,
} from "./support/payloadAdmin";

const SCREENSHOTS_DIRECTORY = resolve(
  ".ai-workspace/tasks/2026-09-09-integrations-catalog/screenshots",
);

const loadIntegrationCatalog = async (
  request: APIRequestContext,
): Promise<IntegrationCatalogDTO> => {
  const response = await request.get("/api/realize-ai/integrations", {
    // Cookie-аутентификация Payload требует контекст запроса с того же origin.
    headers: { "Sec-Fetch-Site": "same-origin" },
  });
  expect(response.status()).toBe(200);
  const envelope =
    (await response.json()) as APIResponse<IntegrationCatalogDTO>;
  expect(envelope.ok).toBe(true);
  if (!envelope.ok) throw new Error("Не удалось прочитать каталог интеграций.");
  return envelope.data;
};

const hasExistingGitHubConnection = async (): Promise<boolean> =>
  await withPayloadTestDatabase(async (database) => {
    const result = await database.query<IntegrationRowCount>(
      `SELECT count(*)::text AS count
         FROM "realize_ai_integrations"
        WHERE "connection_key" = 'github:primary'`,
    );
    return Number(result.rows[0]?.count || 0) > 0;
  });

const cleanupIntegration = async (userId: number): Promise<void> =>
  await withPayloadTestDatabase(async (database) => {
    await database.query(
      `DELETE FROM "realize_ai_integration_events" WHERE "actor_id" = $1`,
      [userId],
    );
    await database.query(
      `DELETE FROM "realize_ai_integrations"
        WHERE "connection_key" = 'github:primary' AND "created_by_id" = $1`,
      [userId],
    );
  });

test("browses the integrations catalog without changing the GitHub connection", async ({
  page,
}) => {
  test.setTimeout(60_000);
  let admin: PayloadAdminFixture | undefined;
  const attemptedMutations: string[] = [];

  // Любая неожиданная запись из UI блокируется до обращения к существующему подключению.
  await page.route("**/api/realize-ai/integrations**", async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") {
      await route.continue();
      return;
    }
    attemptedMutations.push(method);
    await route.abort("blockedbyclient");
  });

  try {
    await page.setViewportSize({ height: 1_000, width: 1_440 });
    admin = await provisionPayloadAdmin(page.request);
    const login = await page.request.post("/api/users/login", {
      data: { email: admin.email, password: admin.password },
    });
    expect(login.ok()).toBe(true);

    const originalCatalog = await loadIntegrationCatalog(page.request);
    const connection = originalCatalog.connections.find(
      (item) => item.provider === "github",
    );
    const isEnabled = connection?.enabled === true;
    await mkdir(SCREENSHOTS_DIRECTORY, { recursive: true });
    await page.goto("/admin/integrations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Интеграции", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    const search = page.getByRole("searchbox", { name: "Поиск интеграций" });
    const githubCard = page.getByRole("link", { name: "Настроить GitHub" });
    const allFilter = page.getByRole("button", { name: "Все", exact: true });
    const activeFilter = page.getByRole("button", {
      name: "Активные",
      exact: true,
    });
    const inactiveFilter = page.getByRole("button", {
      name: "Неактивные",
      exact: true,
    });
    const emptyResults = page.getByRole("heading", {
      name: "Интеграции не найдены",
      exact: true,
    });
    const resetFilters = page.getByRole("button", { name: "Сбросить фильтры" });

    await expect(search).toBeVisible();
    await expect(allFilter).toHaveAttribute("aria-pressed", "true");
    await expect(activeFilter).toHaveAttribute("aria-pressed", "false");
    await expect(inactiveFilter).toHaveAttribute("aria-pressed", "false");
    await expect(githubCard).toHaveAttribute(
      "href",
      "/admin/integrations/github",
    );
    await expect(
      githubCard.getByText(isEnabled ? "Активна" : "Неактивна", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Ссылка на репозиторий")).toHaveCount(0);
    const desktopCardBounds = await githubCard.boundingBox();
    expect(desktopCardBounds).not.toBeNull();
    if (desktopCardBounds) {
      expect(
        Math.abs(desktopCardBounds.width - desktopCardBounds.height),
      ).toBeLessThanOrEqual(1);
    }
    await page.screenshot({
      caret: "initial",
      path: resolve(SCREENSHOTS_DIRECTORY, "catalog-desktop.png"),
    });

    await search.fill("  gItHuB  ");
    await expect(githubCard).toBeVisible();
    await search.fill("несуществующая интеграция");
    await expect(githubCard).toHaveCount(0);
    await expect(emptyResults).toBeVisible();
    await resetFilters.click();
    await expect(search).toHaveValue("");
    await expect(githubCard).toBeVisible();

    const matchingFilter = isEnabled ? activeFilter : inactiveFilter;
    const mismatchingFilter = isEnabled ? inactiveFilter : activeFilter;
    await matchingFilter.click();
    await expect(matchingFilter).toHaveAttribute("aria-pressed", "true");
    await expect(allFilter).toHaveAttribute("aria-pressed", "false");
    await expect(githubCard).toBeVisible();
    await mismatchingFilter.focus();
    await page.keyboard.press("Space");
    await expect(mismatchingFilter).toHaveAttribute("aria-pressed", "true");
    await expect(matchingFilter).toHaveAttribute("aria-pressed", "false");
    await expect(githubCard).toHaveCount(0);
    await expect(emptyResults).toBeVisible();
    await search.fill("GitHub");
    await expect(githubCard).toHaveCount(0);
    await resetFilters.click();
    await expect(search).toHaveValue("");
    await expect(allFilter).toHaveAttribute("aria-pressed", "true");
    await expect(githubCard).toBeVisible();

    await search.focus();
    await page.keyboard.press("Tab");
    await expect(allFilter).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(activeFilter).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(inactiveFilter).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(githubCard).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/integrations\/github$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "GitHub", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Ссылка на репозиторий")).toHaveValue(
      connection?.configuration.repositoryURL ?? "",
    );
    await expect(page.getByLabel("Personal access token")).toHaveValue("");

    await page.getByRole("link", { name: "Все интеграции" }).click();
    await expect(page).toHaveURL(/\/admin\/integrations$/);
    await expect(githubCard).toBeVisible();
    await page.goto("/admin/integrations/github");
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "GitHub", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Ссылка на репозиторий")).toHaveValue(
      connection?.configuration.repositoryURL ?? "",
    );
    await expect(page.getByLabel("Имя автора коммитов")).toHaveValue(
      connection?.configuration.commitAuthor?.name ?? "",
    );
    await expect(page.getByLabel("Email автора коммитов")).toHaveValue(
      connection?.configuration.commitAuthor?.email ?? "",
    );
    await expect(page.getByLabel("Personal access token")).toHaveValue("");
    await page.screenshot({
      caret: "initial",
      path: resolve(SCREENSHOTS_DIRECTORY, "settings-desktop.png"),
    });

    await page.setViewportSize({ height: 844, width: 390 });
    await page.reload();
    await expect(page.getByLabel("Ссылка на репозиторий")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: "initial",
      path: resolve(SCREENSHOTS_DIRECTORY, "settings-mobile.png"),
    });

    await page.getByRole("link", { name: "Все интеграции" }).click();
    await expect(githubCard).toBeVisible();
    await expect(search).toBeVisible();
    const mobileCardBounds = await githubCard.boundingBox();
    expect(mobileCardBounds).not.toBeNull();
    if (mobileCardBounds) {
      expect(
        Math.abs(mobileCardBounds.width - mobileCardBounds.height),
      ).toBeLessThanOrEqual(1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: "initial",
      path: resolve(SCREENSHOTS_DIRECTORY, "catalog-mobile.png"),
    });

    await search.fill("несуществующая интеграция");
    await expect(emptyResults).toBeVisible();
    await resetFilters.click();
    await expect(githubCard).toBeVisible();
    const finalCatalog = await loadIntegrationCatalog(page.request);
    expect(finalCatalog.connections).toEqual(originalCatalog.connections);
    expect(attemptedMutations).toEqual([]);
  } finally {
    if (admin) await removePayloadAdmin(admin);
  }
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
    await page.getByRole("link", { name: "Настроить GitHub" }).click();
    await expect(page).toHaveURL(/\/admin\/integrations\/github$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "GitHub", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Ссылка на репозиторий")
      .fill("https://github.com/realize/example-store");
    await page.getByLabel("Personal access token").fill(token);
    const firstSave = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().endsWith("/api/realize-ai/integrations/github"),
    );
    await page.getByRole("button", { name: "Сохранить" }).click();
    const savedResponse = await firstSave;
    expect(
      savedResponse.status(),
      (await savedResponse.text()).replaceAll(token, "[redacted]"),
    ).toBe(200);
    await expect(page.getByText("Настройки сохранены")).toBeVisible();
    await expect(page.getByLabel("Personal access token")).toHaveValue("");
    await expect(
      page.getByRole("complementary", { name: "Сводка подключения" }),
    ).toContainText("Активна");

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

    const integrationOwnerId = admin.id;
    const stored = await withPayloadTestDatabase(async (database) => {
      const result = await database.query<StoredGitHubIntegrationRow>(
        `SELECT "credential_envelope", "revision"::text,
                "configuration"->>'repositorySlug' AS repository_slug
           FROM "realize_ai_integrations"
          WHERE "connection_key" = 'github:primary' AND "created_by_id" = $1`,
        [integrationOwnerId],
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
    await mkdir(SCREENSHOTS_DIRECTORY, { recursive: true });
    await page.screenshot({
      caret: "initial",
      path: resolve(SCREENSHOTS_DIRECTORY, "credential-settings-desktop.png"),
    });

    await page.setViewportSize({ height: 844, width: 390 });
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "GitHub", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: "initial",
      path: resolve(SCREENSHOTS_DIRECTORY, "credential-settings-mobile.png"),
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

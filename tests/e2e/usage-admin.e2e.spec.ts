/**
 * @file tests/e2e/usage-admin.e2e.spec.ts
 * @version 1.2.0
 * @date 2026-10-06
 * @description Проверяет owner/client расходы через настоящий Admin, HTTP ACL и отдельную PostgreSQL fixture.
 */
import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

test.describe("usage administration", () => {
  test.skip(
    process.env.USAGE_BROWSER_ACCEPTANCE !== "true",
    "Требуется отдельная usage fixture БД и сервер.",
  );
  test("separates owner analytics, customer budget and protected owner identity", async ({
    page,
  }) => {
    test.setTimeout(300000);
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(90000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
      console.error("Usage browser error:", error.message);
    });
    const headers = { Origin: process.env.PLAYWRIGHT_BASE_URL! };
    const get = (url: string) => page.request.get(url, { headers });
    const api = "/api/realize-ai/usage";
    const directory = process.env.USAGE_BROWSER_EVIDENCE_DIR!;
    const uri = new URL(process.env.DATABASE_URI!);
    expect(uri.hostname).toBe("127.0.0.1");
    expect(uri.pathname).toMatch(/^\/realize_usage_fixture_[a-z0-9]+$/);
    const login = async (email: string) => {
      const response = await page.request.post("/api/users/login", {
        headers,
        data: { email, password: process.env.USAGE_BROWSER_PASSWORD },
      });
      expect(response.status()).toBe(200);
    };
    expect((await get(api)).status()).toBe(401);
    await login("usage-admin@example.test");
    const customer = await get(api);
    expect(customer.status()).toBe(200);
    const customerText = await customer.text();
    for (const hidden of [
      "providerCost",
      "infrastructureCost",
      "sourceRef",
      '"prices"',
      "owner-development",
      "foreign-installation",
      "authMode",
    ])
      expect(customerText).not.toContain(hidden);
    expect((await get(`${api}/platform`)).status()).toBe(403);
    expect(
      (await get(`${api}?installationId=foreign-installation`)).status(),
    ).toBe(403);
    expect((await get(`${api}?purpose=development`)).status()).toBe(403);
    for (const action of ["prices", "reconcile", "abandon", "budget"])
      expect(
        (
          await page.request.post(`${api}/platform/${action}`, {
            headers,
            data: {},
          })
        ).status(),
      ).toBe(403);
    expect((await get("/api/realize-ai-usage-events")).status()).toBe(403);
    const mutation = await page.request.patch(
      `/api/users/${process.env.REALIZE_PLATFORM_OWNER_USER_IDS}`,
      { headers, data: { email: "takeover@example.test" } },
    );
    expect([403, 404]).toContain(mutation.status());
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin");
    await page.getByRole("button", { name: "Open Menu", exact: true }).click();
    const analyticsLink = page.getByRole("link", {
      name: "Расходы ИИ",
      exact: true,
    });
    await expect(analyticsLink).toHaveAttribute("href", "/admin/analytics/ai");
    await analyticsLink.click();
    // Первый RSC-переход включает холодную компиляцию отдельного dev fixture.
    await page.waitForURL(/\/admin\/analytics\/ai$/, { timeout: 90000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Расходы ИИ", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByText("Аналитика владельца платформы", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("owner-development", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: resolve(directory, "customer-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Close Menu", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Группировка", exact: true })
      .selectOption("byAgent");
    await page.screenshot({
      path: resolve(directory, "customer-agent-groups.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Показать операции: editor", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Попытки", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Админский агент", exact: true }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: /Фильтры/ })
      .click();
    const agentSelect = page.getByRole("combobox", {
      name: "Админский агент",
      exact: true,
    });
    await expect(agentSelect).toHaveValue("editor");
    await expect(agentSelect.locator('option[value="assistant"]')).toHaveCount(
      1,
    );
    const scopedResponse = page.waitForResponse(
      (response) =>
        response.url().includes("source=workflow") &&
        response.url().includes("agentProfileKey=editor"),
    );
    await page
      .getByRole("combobox", { name: "Тип работы", exact: true })
      .selectOption("workflow");
    const scopedData = (await (await scopedResponse).json()).data;
    expect(scopedData.items.length).toBeGreaterThan(0);
    expect(
      scopedData.items.every(
        (item: { source: string; agentProfileKey: string }) =>
          item.source === "workflow" && item.agentProfileKey === "editor",
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Попытки", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(directory, "customer-agent-filter.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Обзор", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Группировка", exact: true })
      .selectOption("byAgent");
    await page
      .getByRole("button", {
        name: "Показать операции: Без профиля агента",
        exact: true,
      })
      .click();
    await expect(agentSelect).toHaveValue("@unassigned");
    await expect(
      page.getByText("unpriced-fixture", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: /Фильтры/ })
      .click();
    await page.getByRole("tab", { name: "Обзор", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Показатель графика" })
      .selectOption("tokens");
    const day = page.getByRole("slider", { name: "День на графике" });
    const lastDay = Number(await day.inputValue());
    await day.focus();
    await day.press("ArrowLeft");
    await expect(day).toHaveValue(String(lastDay - 1));
    await page.getByRole("tab", { name: "Обзор", exact: true }).focus();
    await page
      .getByRole("tab", { name: "Обзор", exact: true })
      .press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Оптимизация", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Сократите повторные попытки" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Тарифы и сверка", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: resolve(directory, "customer-optimization.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Показать ошибки", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Операции", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Попытки", exact: true }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: /Фильтры/ })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Результат", exact: true }),
    ).toHaveValue("failed");
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible({ timeout: 60000 });
    await page
      .locator("summary")
      .filter({ hasText: /Фильтры/ })
      .click();
    await page.getByRole("tab", { name: "Бюджеты", exact: true }).click();
    await page
      .getByText("Настроить бюджет этой установки", { exact: true })
      .click();
    await page
      .getByLabel("Месячный лимит", { exact: true })
      .fill("12.123456789");
    await page.getByLabel("Резерв на попытку", { exact: true }).fill("1");
    const budgetResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/usage/budget") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Сохранить бюджет", exact: true })
      .click();
    expect((await budgetResponse).status()).toBe(200);
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible({ timeout: 60000 });
    const saved = (await (await get(api)).json()).data;
    expect(saved.budgets[0].policy.limitNanos).toBe("12123456789");
    await page.screenshot({
      path: resolve(directory, "customer-budgets.png"),
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Обзор", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Группировка", exact: true })
      .selectOption("byModel");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Расходы ИИ", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(directory, "customer-mobile.png"),
      fullPage: true,
    });
    await writeFile(
      resolve(directory, "mobile-layout.json"),
      JSON.stringify(
        await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          overflow: Array.from(document.querySelectorAll("body *"))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.right > window.innerWidth + 1;
            })
            .slice(0, 30)
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                tag: el.tagName,
                classes: el.getAttribute("class"),
                width: r.width,
                right: r.right,
                overflowX: getComputedStyle(el).overflowX,
                parent: el.parentElement?.getAttribute("class"),
              };
            }),
        })),
        null,
        2,
      ),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible({ timeout: 60000 });
    await page.screenshot({
      path: resolve(directory, "customer-dark.png"),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible({ timeout: 60000 });
    await page.screenshot({
      path: resolve(directory, "customer-tablet.png"),
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route("**/api/realize-ai/usage?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "INTEGRATION_UNAVAILABLE",
            message: "Проверочный отказ журнала расходов.",
          },
        }),
      }),
    );
    await page.getByRole("button", { name: "Обновить", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Проверочный отказ" }),
    ).toBeVisible();
    await page.unroute("**/api/realize-ai/usage?*");
    await page.getByRole("button", { name: "Обновить", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible({ timeout: 60000 });
    expect(
      (await page.request.post("/api/users/logout", { headers })).status(),
    ).toBe(200);
    await login("usage-owner@example.test");
    await page.goto("/admin/analytics/ai/platform");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Расходы платформы",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible({ timeout: 60000 });
    await page.screenshot({
      path: resolve(directory, "owner-overview.png"),
      fullPage: true,
    });
    await expect(
      page.getByRole("combobox", { name: "Группировка", exact: true }),
    ).toHaveValue("byPurpose");
    await page
      .getByRole("button", {
        name: "Показать операции: Разработка платформы",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("owner-development", { exact: true }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: /Фильтры/ })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Назначение", exact: true }),
    ).toHaveValue("development");
    await expect(
      page.getByText("customer-content", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: /Фильтры/ })
      .click();
    await page.getByRole("tab", { name: "Операции", exact: true }).click();
    await expect(
      page.getByText("owner-development", { exact: true }),
    ).toBeVisible();
    const owner = await get(`${api}/platform`);
    expect(owner.status()).toBe(200);
    expect(await owner.text()).toContain("providerCost");
    await page.screenshot({
      path: resolve(directory, "owner-desktop.png"),
      fullPage: true,
    });
    await page
      .getByRole("tab", { name: "Тарифы и сверка", exact: true })
      .click();
    await page
      .locator("summary")
      .filter({ hasText: /^Опубликовать тариф$/ })
      .click();
    await page
      .getByLabel("Точное имя модели", { exact: true })
      .fill("new-browser-model");
    await page
      .getByLabel("Вход: цена 1 млн токенов", { exact: true })
      .fill("2");
    await page
      .getByLabel("Кеш: цена 1 млн токенов", { exact: true })
      .fill("0.5");
    await page
      .getByLabel("Выход: цена 1 млн токенов", { exact: true })
      .fill("4");
    await page
      .getByLabel("Ссылка на тариф или договор", { exact: true })
      .fill("fixture:browser:tariff");
    const priceResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/usage/platform/prices") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Опубликовать тариф", exact: true })
      .click();
    expect((await priceResponse).status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Тарифы и сверка" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Обзор", exact: true }).click();
    await page
      .locator("summary")
      .filter({ hasText: /Фильтры/ })
      .click();
    await page
      .getByLabel("Модель", { exact: true })
      .selectOption("unpriced-model");
    await expect(
      page.getByRole("region", { name: "Показатели расходов" }),
    ).toBeVisible({ timeout: 60000 });
    await page
      .getByRole("combobox", { name: "Показатель графика" })
      .selectOption("cost");
    await expect(
      page.getByText("Денежная оценка пока недоступна", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Тип работы", exact: true })
      .selectOption("workflow");
    await expect(
      page.getByRole("heading", {
        name: "За этот период нет операций",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(directory, "owner-empty.png"),
      fullPage: true,
    });
    await page.goto("/admin/ai/usage/platform");
    await expect(
      page.getByRole("heading", { level: 1, name: "Расходы платформы" }),
    ).toBeVisible();
    await page.goto("/admin/ai/usage");
    await expect(
      page.getByRole("heading", { level: 1, name: "Расходы ИИ", exact: true }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

/**
 * @file tests/e2e/search-observability.e2e.spec.ts
 * @version 1.0.0
 * @date 2026-09-29
 * @description Проверяет автоматическую диагностику CLI/MCP, retry, dedupe, настройки и очистку через настоящий Admin UI.
 * @see documentation/architecture/repository-search.md
 */
import { test, expect } from "@playwright/test";
import { createSearchObservationRuntime } from "./support/searchObservationRuntime.fixture";
import { provisionPayloadAdmin } from "./support/payloadAdmin";

test("CLI/MCP diagnostics arrive automatically, recover and remain consistent after cleanup", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.SEARCH_ACCEPTANCE_BROWSER !== "true",
    "Requires npm run check:search isolated runner",
  );
  const runtime = await createSearchObservationRuntime();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const anonymous = await request.get("/api/realize-ai/search-observations");
    expect([401, 403]).toContain(anonymous.status());
    const admin = await provisionPayloadAdmin(page.request);
    expect(
      (
        await page.request.post("/api/users/login", {
          data: { email: admin.email, password: admin.password },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/admin");
    const navigation = page.getByRole("link", {
      name: "Диагностика поиска",
      exact: true,
    });
    await expect(navigation).toHaveAttribute("href", "/admin/ai/search");
    const openMenu = page.getByRole("button", {
      name: "Open Menu",
      exact: true,
    });
    await expect(
      page.getByRole("button", { name: /^(Open|Close) Menu$/ }),
    ).toBeVisible();
    if (await openMenu.isVisible()) await openMenu.click();
    await navigation.click();
    await expect(
      page.getByRole("heading", { name: "Диагностика поиска", exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    const history = page.getByRole("region", {
      name: "История поиска",
      exact: true,
    });
    await expect(history.getByRole("status")).toContainText("запросов нет");

    const first = runtime.runCLI();
    expect((await runtime.searchMCP()).isError).not.toBe(true);
    await expect
      .poll(() => [
        runtime.cli.snapshot().errorCode,
        runtime.mcp.snapshot().errorCode,
      ])
      .toEqual(["delivery_unavailable", "delivery_unavailable"]);
    expect((await runtime.store.list({ hours: "24" })).summary.count).toBe(0);
    expect(runtime.observed).toHaveLength(1);
    runtime.recover(); // Повторяет доставку уже полученных метрик, не запускает поиск заново.
    await expect
      .poll(
        async () => (await runtime.store.list({ hours: "24" })).summary.count,
      )
      .toBe(2);
    await expect(history.locator("details")).toHaveCount(2);
    const events = [first.event, runtime.observed[0]];
    const delivered = runtime.delivered();
    for (const event of events) runtime.replay(event);
    await expect.poll(runtime.delivered).toBeGreaterThanOrEqual(delivered + 2);
    expect((await runtime.store.list({ hours: "24" })).summary.count).toBe(2);
    const source = page.getByRole("combobox", {
      name: "Источник",
      exact: true,
    });
    await source.selectOption("cli");
    await expect(history.locator("details")).toHaveCount(1);
    await expect(history.locator("summary")).toContainText("CLI");
    await source.selectOption("mcp");
    await expect(history.locator("summary")).toContainText("MCP");
    await source.selectOption("");
    await expect(history.locator("details")).toHaveCount(2);

    await page
      .getByRole("spinbutton", { name: "Срок хранения, дней", exact: true })
      .fill("2");
    await page
      .getByRole("spinbutton", { name: "Максимум записей", exact: true })
      .fill("100");
    await page
      .getByRole("spinbutton", { name: "Интервал очистки, минут", exact: true })
      .fill("1");
    await page.getByRole("button", { name: "Сохранить и применить" }).click();
    await expect
      .poll(async () => (await runtime.store.control.get()).settings)
      .toEqual({ retentionDays: 2, capacity: 100, cleanupIntervalMinutes: 1 });
    await page.reload();
    await expect(
      page.getByRole("spinbutton", { name: "Максимум записей", exact: true }),
    ).toHaveValue("100");
    await expect(
      page.getByRole("region", { name: "Сборщик cli", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Сборщик mcp", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("automatic-diagnostics.png"),
      fullPage: true,
    });

    await page
      .getByRole("button", { name: "Очистить историю", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog", {
      name: "Очистить историю поиска?",
    });
    await expect(dialog).toContainText("Сохранённых записей к удалению: 2");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Очистить историю", exact: true }),
    ).toBeFocused();
    expect((await runtime.store.list({ hours: "24" })).summary.count).toBe(2);
    await page
      .getByRole("button", { name: "Очистить историю", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    const newer = runtime.runCLI(); // После preview новое событие должно пережить подтверждённую очистку.
    await expect
      .poll(
        async () => (await runtime.store.list({ hours: "24" })).summary.count,
      )
      .toBe(3);
    await dialog.getByRole("button", { name: "Подтвердить очистку" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(history.locator("details")).toHaveCount(1);
    const after = await runtime.store.list({ hours: "24" });
    expect(after.items[0].event.eventID).toBe(newer.event.eventID);
    const replayed = runtime.delivered();
    for (const event of events) runtime.replay(event);
    await expect.poll(runtime.delivered).toBeGreaterThanOrEqual(replayed + 2);
    expect((await runtime.store.list({ hours: "24" })).summary.count).toBe(1);
    expect(JSON.stringify(after)).not.toContain("searchAcceptanceTarget");
    expect(JSON.stringify(after)).not.toContain("src/acceptance.ts");
    expect(pageErrors).toEqual([]);
    await testInfo.attach("cli-process-timing", {
      body: JSON.stringify({
        version: 1,
        initialWallMs: first.wallMs,
        repeatedWallMs: newer.wallMs,
        processPerCall: true,
        osCacheReset: false,
        modelCalls: 0,
      }),
      contentType: "application/json",
    });
  } finally {
    // Администратор и связанные bootstrap-записи принадлежат одноразовой БД;
    // runner удаляет её целиком после закрытия Next и collectors.
    await runtime.close();
  }
});

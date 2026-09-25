/**
 * @file tests/e2e/admin-mcp.e2e.spec.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Проверяет настоящий Admin MCP, CAS, однократные ключи и обе темы на одноразовой БД.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { expect as playwrightExpect, test } from "@playwright/test";
import { provisionPayloadAdmin } from "./support/payloadAdmin";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { createManagedMcpRuntime } from "../../services/internal-mcp/src/createManagedMcpRuntime.config";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import type { McpServerDetailDto } from "@realize/ai-contracts";
const expect = playwrightExpect.configure({ timeout: 15000 });

test("Admin MCP persists settings, applies runtime, preserves conflicts and manages keys", async ({
  page,
}) => {
  test.setTimeout(300000);
  test.skip(
    !process.env.MCP_TEST_DATABASE_URI,
    "Требуется явно выделенная одноразовая MCP database.",
  );
  const database = new URL(process.env.MCP_TEST_DATABASE_URI!);
  if (
    database.hostname !== "127.0.0.1" ||
    !database.pathname.startsWith("/realize_mcp_fixture") ||
    process.env.DATABASE_URI !== database.href
  )
    throw new Error("ISOLATED_MCP_DATABASE_REQUIRED");
  process.env.REALIZE_MCP_HOST_PROFILES = JSON.stringify([
    {
      id: "fixture",
      label: "Тестовый процесс MCP",
      repositoryRoot: null,
      repositoryServerIDs: [],
      allowedPorts: [3335, 3336],
      pagesRead: true,
      controlTokenEnv: "REALIZE_MCP_CONTROL_FIXTURE",
      maximumLimits: {
        callsPerMinute: 60,
        burst: 10,
        concurrentCalls: 4,
        responseBytes: 131072,
      },
    },
  ]);
  const artifacts = resolve(
    ".ai-workspace/tasks/2026-09-20-internal-mcp-audit-7c4e/screenshots",
  );
  await mkdir(artifacts, { recursive: true });
  const payload = await openMcpPayload();
  let listener: Awaited<ReturnType<typeof createMcpHttpServer>> | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const admin = await provisionPayloadAdmin(page.request);
    const login = await page.request.post("/api/users/login", {
      data: { email: admin.email, password: admin.password },
    });
    expect(login.ok()).toBe(true);
    await page.goto(
      `${process.env.MCP_TEST_ADMIN_PREFIX ?? "/admin"}/mcp-servers`,
    );
    await expect(
      page.getByRole("heading", { name: "MCP-серверы", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Поиск по названию").fill(randomUUID());
    await page.getByRole("button", { name: "Найти", exact: true }).click();
    await expect(
      page.getByText("Серверы не найдены.", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Поиск по названию").fill("");
    await page.getByRole("button", { name: "Найти", exact: true }).click();
    await page
      .getByLabel("Добавить экземпляр")
      .selectOption("realize-internal");
    const title = `Browser MCP ${randomUUID().slice(0, 8)}`;
    await page.getByLabel("Название", { exact: true }).fill(title);
    await page
      .getByRole("button", { name: "Создать отключённый сервер" })
      .click();
    await expect(page).toHaveURL(/\/mcp-servers\/[a-f0-9-]{36}$/);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const serverID = page.url().split("/").at(-1)!;
    const endpoint = `/api/realize-ai/mcp-servers/${serverID}`;
    const saved = async (): Promise<McpServerDetailDto> => {
      const response = await page.request.get(endpoint, {
        headers: { "Sec-Fetch-Site": "same-origin" },
      });
      expect(response.ok()).toBe(true);
      return (await response.json()).data;
    };
    expect((await saved()).enabled).toBe(false);
    await page.reload();
    await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
      title,
    );
    const runtime = await createManagedMcpRuntime(payload, {
      ...process.env,
      REALIZE_MCP_CONFIGURATION_MODE: "managed",
      REALIZE_MCP_SERVER_ID: serverID,
      REALIZE_MCP_HOST_PROFILE_ID: "fixture",
    });
    listener = await createMcpHttpServer(runtime.options);
    await runtime.start();
    await page.getByRole("button", { name: "Обновить состояние" }).click();
    await expect(
      page.getByText("Конфигурация применена", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Включить доступ", exact: true })
      .click();
    await expect(
      page.getByText("Ожидает применения", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Применить настройки" }).click();
    await expect
      .poll(async () => (await saved()).observed.status)
      .toBe("applied");
    await page.getByRole("button", { name: "Обновить инструменты" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Подтверждены MCP 2026-07-28" }),
    ).toBeVisible();
    // Вторая вкладка изменяет ту же запись; пользовательский черновик должен остаться.
    await page.getByLabel("Название", { exact: true }).fill(`${title} draft`);
    const current = await saved();
    const concurrent = await page.request.post(endpoint, {
      headers: {
        "Idempotency-Key": randomUUID(),
        "Sec-Fetch-Site": "same-origin",
      },
      data: {
        displayName: `${title} concurrent`,
        configuration: current.configuration,
        expectedRevision: current.desiredRevision,
      },
    });
    expect(concurrent.ok()).toBe(true);
    await page
      .getByRole("button", { name: "Сохранить настройки", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Настройки изменились" }),
    ).toBeVisible();
    await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
      `${title} draft`,
    );
    await page.getByRole("button", { name: "Обновить состояние" }).click();
    await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
      `${title} draft`,
    );
    await page
      .getByRole("button", { name: "Загрузить сохранённые настройки в форму" })
      .click();
    await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
      `${title} concurrent`,
    );
    await page.getByLabel("Название", { exact: true }).fill(title);
    await page
      .getByRole("button", { name: "Сохранить настройки", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.getByLabel("Название клиента").fill("Browser Pages client");
    await page
      .getByLabel("Срок действия")
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page
      .getByRole("switch", { name: "Чтение страниц с моими правами" })
      .check();
    await page.getByRole("button", { name: "Выдать ключ" }).click();
    await expect(page.getByLabel("Новый ключ", { exact: true })).toHaveValue(
      /^mcp\./,
    );
    await page.getByRole("button", { name: "Скрыть ключ" }).click();
    await expect(page.getByLabel("Новый ключ", { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(() => JSON.stringify(localStorage)),
    ).not.toContain("mcp.");
    await page
      .getByRole("button", { name: "Перевыпустить", exact: true })
      .click();
    await expect(page.getByLabel("Новый ключ", { exact: true })).toHaveValue(
      /^mcp\./,
    );
    await page.getByRole("button", { name: "Скрыть ключ" }).click();
    await page.getByRole("button", { name: "Отозвать", exact: true }).click();
    await expect(
      page.getByText("Ключ отозван; новые вызовы запрещены.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Новый ключ", { exact: true })).toHaveCount(0);
    for (const theme of ["light", "dark"] as const) {
      await page.context().addCookies([
        {
          name: "payload-theme",
          value: theme,
          url: new URL(page.url()).origin,
        },
      ]);
      await page.reload();
      await expect(
        page.locator(`[data-ui-theme="${theme}"]`).first(),
      ).toBeVisible();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        ).toBe(true);
        await page.screenshot({
          path: resolve(artifacts, `mcp-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.getByLabel("Название", { exact: true }).focus();
    await expect(page.getByLabel("Название", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel("Название", { exact: true }),
    ).not.toBeFocused();
    await page.setViewportSize({ width: 1440, height: 1000 });
    const detailURL = page.url();
    await page
      .getByRole("link", { name: "Все MCP-серверы", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "MCP-серверы", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(detailURL);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const adminPrefix = process.env.MCP_TEST_ADMIN_PREFIX ?? "/admin";
    await page.goto(`${adminPrefix}/integrations`);
    await expect(
      page.getByRole("heading", { name: "Интеграции", exact: true }),
    ).toBeVisible();
    await page.goto(`${adminPrefix}/ai/settings`);
    await expect(
      page.getByRole("heading", { name: "Агентский слой", exact: true }),
    ).toBeVisible();
    // Реальный customer получает отказ API и не видит управляемый раздел Admin.
    await payload.update({
      collection: "users",
      id: admin.id,
      data: { roles: ["customer"] },
      overrideAccess: true,
    });
    const denied = await page.request.get(endpoint, {
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(denied.status()).toBe(403);
    await page.goto(`${adminPrefix}/mcp-servers`);
    await expect(
      page.getByRole("heading", { name: "MCP-серверы", exact: true }),
    ).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe(`${adminPrefix}/mcp-servers`);
    expect(errors).toEqual([]);
  } finally {
    // Failure evidence не должно сохранять одноразовый credential из DOM.
    await page
      .getByRole("button", { name: "Скрыть ключ", exact: true })
      .click({ timeout: 1000 })
      .catch(() => undefined);
    await listener?.close();
    await payload.destroy();
  }
});

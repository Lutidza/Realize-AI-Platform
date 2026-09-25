/**
 * @file tests/e2e/admin-mcp-chatgpt.e2e.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет форму ключа ChatGPT, ACL, сохранение при CAS и отключение в настоящем Admin.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect as playwrightExpect, test } from "@playwright/test";
import {
  MCP_DEFAULT_LIMITS,
  MCP_REALIZE_TOOLS,
  type McpServerDetailDto,
} from "@realize/ai-contracts";
import { provisionPayloadAdmin } from "./support/payloadAdmin";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { createManagedMcpRuntime } from "../../services/internal-mcp/src/createManagedMcpRuntime.config";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
const expect = playwrightExpect.configure({ timeout: 20000 });

test("ChatGPT key lives in Admin with protected API, real child health and no secret echo", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  test.skip(
    !process.env.MCP_TEST_DATABASE_URI,
    "Требуется отдельная MCP fixture DB.",
  );
  const database = new URL(process.env.MCP_TEST_DATABASE_URI!);
  if (
    database.hostname !== "127.0.0.1" ||
    !database.pathname.startsWith("/realize_mcp_fixture") ||
    database.href !== process.env.DATABASE_URI
  )
    throw new Error("ISOLATED_MCP_DATABASE_REQUIRED");
  const profiles = JSON.parse(process.env.REALIZE_MCP_HOST_PROFILES ?? "[]");
  const profile = profiles.find(
    (entry: { id: string }) => entry.id === "chatgpt-browser",
  );
  if (!profile?.tunnelClientPath?.endsWith("chatgpt-browser-tunnel.cjs"))
    throw new Error("LOCAL_FAKE_TUNNEL_REQUIRED");
  const payload = await openMcpPayload();
  let listener: Awaited<ReturnType<typeof createMcpHttpServer>> | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const admin = await provisionPayloadAdmin(page.request);
    expect(
      (
        await page.request.post("/api/users/login", {
          data: { email: admin.email, password: admin.password },
        })
      ).ok(),
    ).toBe(true);
    const root = "/api/realize-ai/mcp-servers";
    const headers = () => ({
      "Idempotency-Key": randomUUID(),
      "Sec-Fetch-Site": "same-origin",
    });
    const created = await page.request.post(root, {
      headers: headers(),
      data: {
        displayName: `Browser ChatGPT ${randomUUID().slice(0, 8)}`,
        configuration: {
          schemaVersion: "1.0",
          adapterVersion: "1.0",
          serverType: "realize-internal",
          direction: "hosted_endpoint",
          managementSource: "admin_managed",
          environment: "browser-fixture",
          hostProfileID: profile.id,
          port: 3337,
          allowedTools: MCP_REALIZE_TOOLS,
          limits: MCP_DEFAULT_LIMITS,
        },
      },
    });
    expect(created.ok()).toBe(true);
    const serverID = (await created.json()).data.server.serverID as string;
    const endpoint = `${root}/${serverID}`;
    const saved = async (): Promise<McpServerDetailDto> => {
      const response = await page.request.get(endpoint, {
        headers: { "Sec-Fetch-Site": "same-origin" },
      });
      expect(response.status()).toBe(200);
      return (await response.json()).data;
    };
    const runtime = await createManagedMcpRuntime(payload, {
      ...process.env,
      REALIZE_MCP_CONFIGURATION_MODE: "managed",
      REALIZE_MCP_SERVER_ID: serverID,
      REALIZE_MCP_HOST_PROFILE_ID: profile.id,
    });
    listener = await createMcpHttpServer(runtime.options);
    await runtime.start();
    await page.goto(`/admin/mcp-servers/${serverID}`);
    await page
      .getByRole("button", { name: "Включить доступ", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Выключить доступ", exact: true }),
    ).toBeEnabled();
    const form = page.getByRole("region", {
      name: "Подключение ChatGPT",
      exact: true,
    });
    const key = `sk-fixture-${randomBytes(32).toString("base64url")}`;
    const tunnelID = `tunnel_${randomUUID().replaceAll("-", "")}`;
    await form.getByLabel("Tunnel ID", { exact: true }).fill(tunnelID);
    const keyInput = form.getByLabel("Ключ OpenAI для туннеля", {
      exact: true,
    });
    await expect(keyInput).toHaveAttribute("type", "password");
    await keyInput.fill(key);
    await form
      .getByLabel("Чтение страниц с моими правами", { exact: true })
      .check();
    await form
      .getByRole("button", {
        name: "Сохранить и подключить ChatGPT",
        exact: true,
      })
      .click();
    await expect(keyInput).toHaveValue("");
    await expect(
      form.getByText("Ключ сохранён в зашифрованном хранилище.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect
      .poll(async () => (await saved()).chatgpt?.status)
      .toBe("connected");
    await page
      .getByRole("button", { name: "Обновить состояние", exact: true })
      .click();
    await expect(
      form.getByText("Состояние: Туннель готов", { exact: true }),
    ).toBeVisible();
    const detail = await saved();
    expect(JSON.stringify(detail)).not.toContain(key);
    expect(detail.chatgpt?.hasApiKey).toBe(true);
    expect(
      detail.clients.filter(
        (client) => client.clientID === detail.chatgpt?.clientID,
      ),
    ).toHaveLength(1);
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
    ).not.toContain(key);
    await page.reload();
    await expect(form.getByLabel("Tunnel ID", { exact: true })).toHaveValue(
      tunnelID,
    );
    await expect(keyInput).toHaveValue("");

    // Пустой input сохраняет credential, новый CAS конфликт оставляет введённый ключ в форме.
    const current = await saved();
    const concurrent = await page.request.post(endpoint, {
      headers: headers(),
      data: {
        expectedRevision: current.desiredRevision,
        displayName: `${current.displayName} changed`,
        configuration: current.configuration,
      },
    });
    expect(concurrent.ok()).toBe(true);
    const replacement = `sk-fixture-${randomBytes(32).toString("base64url")}`;
    await keyInput.fill(replacement);
    const conflict = page.waitForResponse(
      (response) =>
        response.url().endsWith(`${endpoint}/chatgpt`) &&
        response.request().method() === "POST",
    );
    await form
      .getByRole("button", {
        name: "Сохранить и подключить ChatGPT",
        exact: true,
      })
      .click();
    expect((await conflict).status()).toBe(409);
    await expect(keyInput).toHaveValue(replacement);
    await page
      .getByRole("button", { name: "Обновить состояние", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Загрузить сохранённые настройки в форму",
        exact: true,
      })
      .click();
    await expect(keyInput).toHaveValue("");
    await form
      .getByRole("button", {
        name: "Сохранить и подключить ChatGPT",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await saved()).chatgpt?.status)
      .toBe("connected");

    const anonymous = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL,
    });
    try {
      expect(
        (
          await anonymous.request.post(`${endpoint}/chatgpt/disconnect`, {
            headers: headers(),
            data: { expectedRevision: (await saved()).desiredRevision },
          })
        ).status(),
      ).toBe(401);
      const email = `customer-chatgpt-${randomUUID()}@example.invalid`;
      const password = randomBytes(24).toString("base64url");
      expect(
        (
          await anonymous.request.post("/api/users", {
            data: { email, password },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await anonymous.request.post("/api/users/login", {
            data: { email, password },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await anonymous.request.get(endpoint, {
            headers: { "Sec-Fetch-Site": "same-origin" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await anonymous.request.post(`${endpoint}/chatgpt/disconnect`, {
            headers: headers(),
            data: { expectedRevision: (await saved()).desiredRevision },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await anonymous.close();
    }

    await page
      .getByRole("button", { name: "Обновить состояние", exact: true })
      .click();
    const artifacts = resolve(
      ".ai-workspace/tasks/2026-09-20-internal-mcp-audit-7c4e/screenshots",
    );
    await mkdir(artifacts, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await form.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: resolve(artifacts, `chatgpt-admin-${width}.png`),
        fullPage: true,
      });
      await form.screenshot({
        path: resolve(artifacts, `chatgpt-admin-form-${width}.png`),
      });
    }
    await keyInput.focus();
    await page.keyboard.press("Tab");
    await expect(
      form.getByLabel("Доступ ChatGPT к MCP до", { exact: true }),
    ).toBeFocused();
    await form
      .getByRole("button", {
        name: "Отключить ChatGPT и удалить ключ",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await saved()).chatgpt?.status)
      .toBe("not_configured");
    await page.reload();
    await expect(form.getByLabel("Tunnel ID", { exact: true })).toHaveValue("");
    expect((await saved()).hasCredential).toBe(false);
    expect(
      (await saved()).clients.find(
        (client) => client.clientID === detail.chatgpt?.clientID,
      )?.revokedAt,
    ).toBeTruthy();
    expect(errors).toEqual([]);
  } finally {
    await listener?.close();
    await payload.destroy();
  }
});

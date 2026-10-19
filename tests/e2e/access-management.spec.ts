/**
 * @file tests/e2e/access-management.spec.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет реальный центр доступов, однократный секрет и device consent в изолированной browser fixture.
 * @see documentation/architecture/platform-access.md
 */
import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { runAccessCliAcceptance } from "./support/accessCliAcceptance.service";

// Credential responses не записываются в trace, video, screenshots или snapshots assertions.
test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe("platform access browser acceptance", () => {
  test.skip(
    process.env.ACCESS_BROWSER_ACCEPTANCE !== "true",
    "Требуется отдельная access fixture БД и сервер.",
  );
  test("creates, forgets and revokes tokens; requires explicit CLI consent and fits mobile", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    page.setDefaultTimeout(25_000);
    page.setDefaultNavigationTimeout(120_000);
    const database = new URL(process.env.DATABASE_URI!);
    expect(database.hostname).toBe("127.0.0.1");
    expect(database.pathname).toMatch(
      /^\/realize_task_browser_fixture_[a-z0-9]+$/,
    );
    const origin = process.env.PLAYWRIGHT_BASE_URL!;
    const headers = { Origin: origin };
    const evidence = process.env.TASK_BROWSER_EVIDENCE_DIR!;
    let pageErrors = 0;
    page.on("pageerror", () => {
      pageErrors++;
    });
    const login = async (email: string) => {
      const response = await page.request.post("/api/users/login", {
        headers,
        data: { email, password: process.env.TASK_BROWSER_PASSWORD },
      });
      expect(response.status()).toBe(200);
    };
    await test.step("cookie-only admission", async () => {
      const anonymous = await page.request.get("/system/access", {
        headers,
        maxRedirects: 0,
      });
      expect(anonymous.status()).toBe(307);
      expect(new URL(anonymous.headers().location, origin).pathname).toBe(
        "/admin/login",
      );
      expect(
        (await page.request.get("/api/access/context", { headers })).status(),
      ).toBe(401);
      await login("task-customer@example.test");
      expect(
        (await page.request.get("/api/access/context", { headers })).status(),
      ).toBe(403);
      await page.context().clearCookies();
      await login("task-owner@example.test");
      expect(
        (
          await page.request.get("/system/access", {
            headers: { ...headers, Authorization: "Bearer fixture" },
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(307);
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/system/access");
    const createButton = page.getByRole("button", {
      name: "Создать доступ",
      exact: true,
    });
    await expect(createButton).toBeEnabled();
    await expect(
      page.getByRole("link", { name: "Доступы и токены", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Подключение CLI", exact: true }),
    ).toHaveAttribute("href", "/system/access/device");
    await expect(
      page.getByText(
        `npm run --silent task:workspace -- login --url '${origin}/api/task-manager'`,
        { exact: true },
      ),
    ).toBeVisible();
    await test.step("one-time creation, copy and secret removal", async () => {
      await createButton.focus();
      await createButton.press("Enter");
      const create = page.getByRole("dialog", {
        name: "Создать доступ",
        exact: true,
      });
      await expect(
        create.getByLabel("Название доступа", { exact: true }),
      ).toBeFocused();
      await create
        .getByLabel("Название доступа", { exact: true })
        .fill("Проверка API доступа");
      await create
        .getByRole("combobox", { name: "Назначение", exact: true })
        .selectOption("api");
      await create.getByLabel("Срок, дней", { exact: true }).fill("7");
      await create
        .getByRole("button", { name: "Создать токен", exact: true })
        .click();
      const reveal = page.getByRole("dialog", {
        name: "Сохраните токен",
        exact: true,
      });
      let hasOpaqueSecret = false;
      let copyConfirmed = false;
      try {
        await reveal.waitFor({ state: "visible" });
        const secret = await reveal
          .getByRole("textbox", { name: "Новый токен", exact: true })
          .inputValue();
        hasOpaqueSecret = /^rza\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(
          secret,
        );
        await reveal
          .getByRole("button", { name: "Копировать токен", exact: true })
          .click();
        const copied = reveal.getByText(
          "Токен скопирован. Сохраните его в защищённом хранилище.",
          { exact: true },
        );
        await copied.waitFor({ state: "visible" });
        copyConfirmed = await copied.isVisible();
      } finally {
        // Даже неуспешная проверка не оставляет secret в автоматическом error context.
        try {
          await reveal
            .getByRole("button", { name: "Скрыть и закрыть", exact: true })
            .click();
          await reveal.waitFor({ state: "hidden" });
        } catch {
          await page.goto("about:blank").catch(() => page.close());
          throw new Error(
            "Secret dialog cleanup failed; the page was cleared.",
          );
        }
        await page.evaluate(async () => {
          await navigator.clipboard?.writeText("").catch(() => undefined);
        });
      }
      expect(hasOpaqueSecret).toBe(true);
      expect(copyConfirmed).toBe(true);
      await expect(
        page.getByRole("textbox", { name: "Новый токен", exact: true }),
      ).toHaveCount(0);
      const card = page.getByRole("article", {
        name: "Проверка API доступа",
        exact: true,
      });
      await expect(card).toContainText("Активен");
      await page.reload();
      await expect(card).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Новый токен", exact: true }),
      ).toHaveCount(0);
      const noSecretInMetadata = await page.evaluate(async () => {
        const body = await (
          await fetch("/api/access/tokens", { cache: "no-store" })
        ).text();
        return !/rza\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(body);
      });
      expect(noSecretInMetadata).toBe(true);
    });

    await test.step("explicit revoke and keyboard return", async () => {
      const card = page.getByRole("article", {
        name: "Проверка API доступа",
        exact: true,
      });
      await card
        .getByRole("button", { name: "Отозвать доступ", exact: true })
        .click();
      const confirm = page.getByRole("alertdialog", {
        name: "Отозвать доступ?",
        exact: true,
      });
      await expect(
        confirm.getByRole("button", { name: "Отмена", exact: true }),
      ).toBeFocused();
      await confirm
        .getByRole("button", { name: "Отозвать", exact: true })
        .click();
      await expect(confirm).not.toBeVisible();
      await expect(card).toContainText("Отозван");
      await expect(
        card.getByRole("button", { name: "Отозвать доступ", exact: true }),
      ).toBeDisabled();
    });

    await test.step("device lookup is read-only; approve issues one CLI connection", async () => {
      const started = await page.request.post("/api/access/device", {
        headers,
        data: {
          clientName: "CLI browser approval",
          scopes: ["task-manager:read"],
        },
      });
      expect(started.status()).toBe(200);
      const pending = (await started.json()).data;
      expect(new URL(pending.verificationUri).pathname).toBe(
        "/system/access/device",
      );
      expect(new URL(pending.verificationUri).search).toBe("");
      let decisions = 0;
      const observeDecision = (request: import("@playwright/test").Request) => {
        if (new URL(request.url()).pathname === "/api/access/device/decision")
          decisions++;
      };
      page.on("request", observeDecision);
      await page.goto("/system/access/device");
      await expect(
        page.getByRole("link", { name: "Подключение CLI", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await page
        .getByLabel("Код из CLI", { exact: true })
        .fill(pending.userCode);
      await page
        .getByRole("button", { name: "Проверить код", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "CLI browser approval",
          exact: true,
        }),
      ).toBeVisible();
      expect(decisions).toBe(0);
      const approve = page.getByRole("button", {
        name: "Разрешить подключение",
        exact: true,
      });
      await expect(approve).toBeDisabled();
      await page
        .getByRole("switch", {
          name: "Код совпадает с показанным в моём CLI",
          exact: true,
        })
        .check();
      await approve.click();
      await expect(
        page.getByText(
          "Подключение разрешено. Вернитесь в CLI, чтобы завершить вход.",
          { exact: true },
        ),
      ).toBeVisible();
      expect(decisions).toBe(1);
      page.off("request", observeDecision);
      const exchange = await page.request.post("/api/access/device/token", {
        headers,
        data: { deviceCode: pending.deviceCode },
      });
      expect(exchange.status()).toBe(200);
      const issued = (await exchange.json()).data;
      expect(issued.status).toBe("issued");
      const accessToken: string = issued.credential.accessToken;
      expect(
        typeof accessToken === "string" && accessToken.startsWith("rza."),
      ).toBe(true);
      await page.goto("/system/access");
      const card = page.getByRole("article", {
        name: "CLI browser approval",
        exact: true,
      });
      await expect(card).toContainText("CLI");
      await card
        .getByRole("button", { name: "Отозвать доступ", exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Отозвать", exact: true })
        .click();
      await expect(card).toContainText("Отозван");
      expect(
        (
          await page.request.get("/api/access/session", {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
          })
        ).status(),
      ).toBe(401);
    });

    await test.step("deny never issues credentials", async () => {
      const started = await page.request.post("/api/access/device", {
        headers,
        data: {
          clientName: "CLI browser denial",
          scopes: ["task-manager:read"],
        },
      });
      expect(started.status()).toBe(200);
      const pending = (await started.json()).data;
      await page.goto("/system/access/device");
      await page
        .getByLabel("Код из CLI", { exact: true })
        .fill(pending.userCode);
      await page
        .getByRole("button", { name: "Проверить код", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Отклонить подключение", exact: true })
        .click();
      await expect(
        page.getByText("Подключение отклонено. CLI не получит доступ.", {
          exact: true,
        }),
      ).toBeVisible();
      const denied = await page.request.post("/api/access/device/token", {
        headers,
        data: { deviceCode: pending.deviceCode },
      });
      const result = (await denied.json()).data;
      expect(result.status).toBe("access_denied");
      expect(result.credential === null).toBe(true);
    });

    await test.step("mobile layout and dialog keyboard", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/system/access");
      await expect(createButton).toBeEnabled();
      await createButton.click();
      const dialog = page.getByRole("dialog", {
        name: "Создать доступ",
        exact: true,
      });
      await expect(
        dialog.getByLabel("Название доступа", { exact: true }),
      ).toBeFocused();
      const noDialogOverflow = await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      );
      expect(noDialogOverflow).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(createButton).toBeFocused();
      const noPageOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      expect(noPageOverflow).toBe(true);
      await page.screenshot({
        path: resolve(evidence, "access-mobile.png"),
        fullPage: true,
      });
    });

    await test.step("real CLI uses keyring and revokes its browser-approved connection", async () => {
      const result = await runAccessCliAcceptance({
        baseURL: origin,
        temporaryDirectory: evidence,
        approve: async (userCode) => {
          await page.goto("/system/access/device");
          await page.getByLabel("Код из CLI", { exact: true }).fill(userCode);
          await page
            .getByRole("button", { name: "Проверить код", exact: true })
            .click();
          await page
            .getByRole("switch", {
              name: "Код совпадает с показанным в моём CLI",
              exact: true,
            })
            .check();
          await page
            .getByRole("button", { name: "Разрешить подключение", exact: true })
            .click();
          await expect(
            page.getByText(
              "Подключение разрешено. Вернитесь в CLI, чтобы завершить вход.",
              { exact: true },
            ),
          ).toBeVisible();
        },
      });
      expect(result).toEqual({
        login: "authenticated",
        status: "authenticated",
        projects: "completed",
        logout: "logged_out",
        remoteRevoked: true,
      });
      await page.goto("/system/access");
      await expect(
        page.getByRole("article", {
          name: "Isolated CLI browser acceptance",
          exact: true,
        }),
      ).toContainText("Отозван");
    });

    expect(pageErrors).toBe(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: resolve(evidence, "access-desktop.png"),
      fullPage: true,
    });
    await writeFile(
      resolve(evidence, "access-summary.json"),
      JSON.stringify(
        {
          cookieOnly: true,
          oneTimeSecret: true,
          metadataOnlyReload: true,
          revoked: true,
          deviceReadOnlyLookup: true,
          deviceApproved: true,
          deviceDenied: true,
          keyboard: true,
          responsive: true,
          realCliKeyring: true,
          realCliLogout: true,
          pageErrors,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  });
});

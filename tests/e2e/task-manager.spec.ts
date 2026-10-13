/**
 * @file tests/e2e/task-manager.spec.ts
 * @version 1.3.0
 * @date 2026-10-13
 * @description Проверяет реальные постоянные задачи, сохранение черновика при конфликте и мобильный интерфейс в отдельной fixture.
 * @see documentation/specifications/task-management-execution.md
 */
import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

test.describe("durable Task Manager browser acceptance", () => {
  test.skip(
    process.env.TASK_BROWSER_ACCEPTANCE !== "true",
    "Требуется отдельная Task Manager fixture БД и сервер.",
  );
  test("creates and restores tasks, protects drafts during concurrent editing and fits mobile", async ({
    page,
  }) => {
    test.setTimeout(360000);
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(120000);
    const uri = new URL(process.env.DATABASE_URI!);
    expect(uri.hostname).toBe("127.0.0.1");
    expect(uri.pathname).toMatch(/^\/realize_task_browser_fixture_[a-z0-9]+$/);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const directory = process.env.TASK_BROWSER_EVIDENCE_DIR!;
    let observedTaskPath = "";
    const headers = { Origin: process.env.PLAYWRIGHT_BASE_URL! };
    const login = async (email: string) => {
      const response = await page.request.post("/api/users/login", {
        headers,
        data: { email, password: process.env.TASK_BROWSER_PASSWORD },
      });
      expect(response.status()).toBe(200);
    };
    await test.step("anonymous and customer admission", async () => {
      expect(
        (
          await page.request.get("/api/task-manager/projects", { headers })
        ).status(),
      ).toBe(401);
      // Проверяем ответ защищённого route, не компилируя посторонний Payload Admin.
      const anonymous = await page.request.get("/system/task-manager", {
        headers,
        maxRedirects: 0,
      });
      expect(anonymous.status()).toBe(307);
      const loginURL = new URL(
        anonymous.headers().location,
        process.env.PLAYWRIGHT_BASE_URL!,
      );
      expect(loginURL.pathname).toBe("/admin/login");
      expect(loginURL.searchParams.get("redirect")).toBe(
        "/system/task-manager",
      );
      await login("task-customer@example.test");
      expect(
        (
          await page.request.get("/api/task-manager/projects", { headers })
        ).status(),
      ).toBe(403);
      const customer = await page.request.get("/system/task-manager", {
        headers,
        maxRedirects: 0,
      });
      expect(customer.status()).toBe(307);
      expect(
        new URL(customer.headers().location, process.env.PLAYWRIGHT_BASE_URL!)
          .pathname,
      ).toBe("/admin/unauthorized");
      await page.context().clearCookies();
      await login("task-owner@example.test");
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/system/task-manager");
    await test.step("project creation, error focus and keyboard navigation", async () => {
      const begin = page.getByRole("button", {
        name: "Создать первый проект",
        exact: true,
      });
      // Cold isolated Next должен успеть hydrate UI и получить project list.
      await expect(begin).toBeVisible({ timeout: 20000 });
      await begin.focus();
      await begin.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: "Новый проект",
        exact: true,
      });
      await dialog
        .getByRole("button", { name: "Создать проект", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toBeFocused();
      const title = dialog.getByLabel("Название проекта", { exact: true });
      await title.fill("Развитие платформы");
      await title.press("Tab");
      await expect(
        dialog.getByLabel("Описание проекта", { exact: true }),
      ).toBeFocused();
      await dialog
        .getByLabel("Описание проекта", { exact: true })
        .fill("Рабочий проект браузерной приёмки");
      await dialog
        .getByRole("checkbox", { name: "Task member fixture", exact: true })
        .check();
      await dialog
        .getByRole("button", { name: "Создать проект", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByText("В списке пока нет задач", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("combobox", { name: "Список задач", exact: true })
          .first(),
      ).toHaveValue(/.+/);
    });
    await test.step("task creation and manual full SHA binding", async () => {
      await page
        .getByRole("button", { name: "Создать задачу", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Новая задача",
        exact: true,
      });
      await dialog
        .getByLabel("Название задачи", { exact: true })
        .fill("Проверить внедрение Task Manager");
      await dialog
        .getByLabel("Описание", { exact: true })
        .fill("Сохранение, коммиты и история должны пережить перезагрузку.");
      await dialog
        .getByRole("combobox", { name: "Исполнитель", exact: true })
        .selectOption({ label: "Task member fixture" });
      await dialog
        .getByRole("button", { name: "Добавить коммит", exact: true })
        .click();
      await dialog
        .getByLabel("Репозиторий 1", { exact: true })
        .fill("fixture/platform");
      await dialog
        .getByLabel("SHA коммита 1", { exact: true })
        .fill("a".repeat(40));
      await dialog
        .getByRole("button", { name: "Создать задачу", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await page
        .getByRole("button", { name: /Проверить внедрение Task Manager/ })
        .click();
      await expect(
        page.getByText("Вручную · Не проверено", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("a".repeat(40), { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "История задачи" })
          .getByRole("listitem"),
      ).toHaveCount(1);
    });
    await test.step("live Git read is explicit, read-only and independent of provider availability", async () => {
      const region = page.getByRole("region", {
        name: "Сведения Git",
        exact: true,
      });
      const button = region.getByRole("button", {
        name: "Проверить Git",
        exact: true,
      });
      await button.focus();
      const responsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/git-observations"),
      );
      await button.press("Enter");
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const actual = await response.json();
      expect(actual.data.complete).toBe(true);
      expect(actual.data.items[0].status).toBe("unavailable");
      expect(actual.data.items[0].reason).toBe("not_configured");
      await expect(region).toContainText(
        "Подключение GitHub не настроено для чтения.",
      );
      observedTaskPath = new URL(response.url()).pathname.replace(
        "/git-observations",
        "",
      );
      const saved = await (
        await page.request.get(observedTaskPath, { headers })
      ).json();
      expect(saved.data.revision).toBe(1);
      expect(saved.data.gitBindings[0].verification).toBe("unverified");
      await expect(
        page
          .getByRole("region", { name: "История задачи" })
          .getByRole("listitem"),
      ).toHaveCount(1);

      // Реальный POST фиксируется в БД; браузеру один раз возвращаем 503 после commit.
      const syncPath = observedTaskPath + "/git-syncs";
      const retryKeys: string[] = [];
      let storedReceiptId = "";
      await page.route("**" + syncPath, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        retryKeys.push(route.request().headers()["idempotency-key"]);
        const result = await route.fetch();
        expect(result.status()).toBe(200);
        const receipt = await result.json();
        if (!storedReceiptId) storedReceiptId = receipt.data.id;
        expect(receipt.data.id).toBe(storedReceiptId);
        if (retryKeys.length === 1) {
          await route.fulfill({
            status: 503,
            json: {
              ok: false,
              error: {
                code: "STORAGE_UNAVAILABLE",
                message: "Fixture response interrupted after durable commit",
              },
            },
          });
        } else await route.fulfill({ response: result });
      });
      await region
        .getByRole("button", { name: "Синхронизировать Git", exact: true })
        .click();
      await expect(region).toContainText(
        "Результат синхронизации не подтверждён",
      );
      await region
        .getByRole("button", { name: "Повторить синхронизацию", exact: true })
        .click();
      await expect(region).toContainText("Сохранённый снимок · ревизия 1");
      expect(retryKeys).toHaveLength(2);
      expect(retryKeys[0]).toBe(retryKeys[1]);
      const persisted = await (
        await page.request.get(syncPath, { headers })
      ).json();
      expect(persisted.data.items).toHaveLength(1);
      expect(persisted.data.items[0].id).toBe(storedReceiptId);
      await page.unroute("**" + syncPath);
      await page
        .getByRole("button", { name: "Закрыть карточку", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Проверить внедрение Task Manager/ })
        .click();
      await expect(region).toContainText("Сохранённый снимок · ревизия 1");
      await expect(region).toContainText(
        "Подключение GitHub не настроено для чтения.",
      );
      const unchanged = await (
        await page.request.get(observedTaskPath, { headers })
      ).json();
      expect(unchanged.data).toEqual(saved.data);

      // Явная DTO fixture проверяет успешное представление; live provider success здесь не заявляется.
      const observationPath = observedTaskPath + "/git-observations";
      await page.route("**" + observationPath, async (route) => {
        await route.fulfill({
          json: {
            ok: true,
            data: {
              ...actual.data,
              items: [
                {
                  binding: saved.data.gitBindings[0],
                  status: "observed",
                  repository: {
                    id: "123",
                    fullName: "fixture/platform",
                    url: "https://github.com/fixture/platform",
                  },
                  commit: {
                    sha: "a".repeat(40),
                    url:
                      "https://github.com/fixture/platform/commit/" +
                      "a".repeat(40),
                  },
                  pullRequests: [
                    {
                      number: 7,
                      url: "https://github.com/fixture/platform/pull/7",
                      state: "open",
                      draft: true,
                      merged: false,
                    },
                  ],
                  pullRequestsComplete: false,
                  ci: {
                    checkRuns: {
                      status: "observed",
                      items: [
                        {
                          id: "9",
                          name: "Проверка контрактов",
                          headSha: "a".repeat(40),
                          status: "completed",
                          conclusion: "success",
                          url: "https://github.com/fixture/platform/runs/9",
                        },
                      ],
                      totalCount: 2,
                      complete: false,
                    },
                    commitStatuses: {
                      status: "unavailable",
                      reason: "provider_unavailable",
                    },
                  },
                },
              ],
            },
          },
        });
      });
      await region
        .getByRole("button", { name: "Проверить Git", exact: true })
        .click();
      await expect(
        region.getByRole("link", { name: "PR #7", exact: true }),
      ).toHaveAttribute("href", "https://github.com/fixture/platform/pull/7");
      await expect(region).toContainText("Открыт · Черновик");
      await expect(region).toContainText(
        "Показана первая страница связанных PR.",
      );
      await expect(region).toContainText(
        "Показано 1 из 2 checks; выборка неполная.",
      );
      await expect(region).toContainText("Статусы CI недоступны.");
      await expect(
        region.getByRole("link", { name: "Проверка контрактов", exact: true }),
      ).toHaveAttribute("href", "https://github.com/fixture/platform/runs/9");
      await expect(
        page.getByText("Вручную · Не проверено", { exact: true }),
      ).toBeVisible();
      const prLink = region.getByRole("link", { name: "PR #7", exact: true });
      await prLink.scrollIntoViewIfNeeded();
      await expect(prLink).toBeVisible();
      await page.screenshot({
        path: resolve(directory, "git-observations-fixture.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await prLink.scrollIntoViewIfNeeded();
      await expect(prLink).toBeVisible();
      const prBox = await prLink.boundingBox();
      expect(prBox).not.toBeNull();
      expect(prBox!.x).toBeGreaterThanOrEqual(0);
      expect(prBox!.x + prBox!.width).toBeLessThanOrEqual(390);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(391);
      await page.screenshot({
        path: resolve(directory, "git-observations-mobile-fixture.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.unroute("**" + observationPath);
    });
    await test.step("edit, reload and audit persistence", async () => {
      await page
        .getByRole("button", { name: "Редактировать", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: /Редактирование/ });
      await dialog
        .getByLabel("Название задачи", { exact: true })
        .fill("Task Manager: сохранённая задача");
      await dialog
        .getByRole("button", { name: "Сохранить изменения", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Сведения Git" })
          .getByRole("link", { name: "PR #7", exact: true }),
      ).toHaveCount(0);
      await page.reload();
      await page
        .getByRole("button", { name: /Task Manager: сохранённая задача/ })
        .click();
      const history = page.getByRole("region", { name: "История задачи" });
      await expect(history.getByRole("listitem")).toHaveCount(2);
      await expect(history).toContainText("Task owner fixture");
      await expect(
        page.getByText("a".repeat(40), { exact: true }),
      ).toBeVisible();
      const gitRegion = page.getByRole("region", {
        name: "Сведения Git",
        exact: true,
      });
      await expect(gitRegion).toContainText(
        "Снимка для текущей ревизии 2 ещё нет",
      );
      await gitRegion.locator("summary").click();
      await gitRegion.getByRole("button", { name: /^Ревизия 1 ·/ }).click();
      await expect(gitRegion).toContainText("Исторический снимок: ревизия 1");
      await expect(gitRegion).toContainText("Текущая ревизия задачи — 2");
    });
    await test.step("concurrent tabs preserve the rejected draft and require explicit reload", async () => {
      const second = await page.context().newPage();
      second.setDefaultTimeout(20000);
      second.on("pageerror", (error) => errors.push(error.message));
      await second.goto("/system/task-manager");
      await second
        .getByRole("button", { name: /Task Manager: сохранённая задача/ })
        .click();
      await second
        .getByRole("button", { name: "Редактировать", exact: true })
        .click();
      const stale = second.getByRole("dialog", { name: /Редактирование/ });
      await stale
        .getByLabel("Название задачи", { exact: true })
        .fill("Черновик второй вкладки");
      await page
        .getByRole("button", { name: "Редактировать", exact: true })
        .click();
      const first = page.getByRole("dialog", { name: /Редактирование/ });
      await first
        .getByLabel("Название задачи", { exact: true })
        .fill("Изменение первой вкладки");
      await first
        .getByRole("button", { name: "Сохранить изменения", exact: true })
        .click();
      await expect(first).not.toBeVisible();
      const conflict = second.waitForResponse(
        (response) =>
          response.request().method() === "PATCH" &&
          response.url().includes("/api/task-manager/tasks/"),
      );
      await stale
        .getByRole("button", { name: "Сохранить изменения", exact: true })
        .click();
      expect((await conflict).status()).toBe(409);
      await expect(stale.getByRole("alert")).toBeFocused();
      await expect(
        stale.getByLabel("Название задачи", { exact: true }),
      ).toHaveValue("Черновик второй вкладки");
      await second.screenshot({
        path: resolve(directory, "revision-conflict.png"),
        fullPage: true,
      });
      await stale
        .getByRole("button", {
          name: "Загрузить актуальную версию",
          exact: true,
        })
        .click();
      const confirmation = second.getByRole("alertdialog", {
        name: "Загрузить актуальную задачу?",
        exact: true,
      });
      await confirmation
        .getByRole("button", { name: "Продолжить редактирование", exact: true })
        .click();
      await expect(
        stale.getByLabel("Название задачи", { exact: true }),
      ).toHaveValue("Черновик второй вкладки");
      await stale
        .getByRole("button", {
          name: "Загрузить актуальную версию",
          exact: true,
        })
        .click();
      await confirmation
        .getByRole("button", { name: "Загрузить", exact: true })
        .click();
      await expect(
        stale.getByLabel("Название задачи", { exact: true }),
      ).toHaveValue("Изменение первой вкладки");
      await stale.press("Escape");
      await expect(stale).not.toBeVisible();
      await second.close();
      await page.reload();
      await page
        .getByRole("button", { name: /Изменение первой вкладки/ })
        .click();
      await expect(
        page
          .getByRole("region", { name: "История задачи" })
          .getByRole("listitem"),
      ).toHaveCount(3);
      await page.screenshot({
        path: resolve(directory, "task-manager-desktop.png"),
        fullPage: true,
      });
    });
    await test.step("mobile task creation and contained horizontal scrolling", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Создать задачу", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Новая задача",
        exact: true,
      });
      await dialog
        .getByLabel("Название задачи", { exact: true })
        .fill("Мобильная задача");
      await dialog.getByLabel("Название задачи", { exact: true }).press("Tab");
      await expect(
        dialog.getByLabel("Описание", { exact: true }),
      ).toBeFocused();
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
      await page.screenshot({
        path: resolve(directory, "task-editor-mobile.png"),
        fullPage: true,
      });
      await dialog
        .getByRole("button", { name: "Создать задачу", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: /Мобильная задача/ }),
      ).toBeVisible();
      const layout = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
      const titleColumn = page.getByRole("cell").filter({
        has: page.getByRole("button", { name: /Изменение первой вкладки/ }),
      });
      const titleColumnWidth = (await titleColumn.boundingBox())?.width;
      // Таблица прокручивается внутри; названия сохраняют читаемую колонку на мобильном.
      expect(titleColumnWidth).toBeGreaterThanOrEqual(200);
      await page.screenshot({
        path: resolve(directory, "task-manager-mobile.png"),
        fullPage: true,
      });
      await writeFile(
        resolve(process.env.TASK_BROWSER_LOGS_DIR!, "browser-evidence.json"),
        JSON.stringify(
          {
            desktop: { width: 1440, height: 1000 },
            mobile: { ...layout, height: 844, titleColumnWidth },
            conflictStatus: 409,
            historyEvents: 3,
            pageErrors: errors,
          },
          null,
          2,
        ),
      );
    });
    await test.step("shared shell switches and restores both themes", async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole("button", {
          name: "Профиль: Task owner fixture",
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitemradio", { name: "Светлая", exact: true })
        .click();
      await page.keyboard.press("Escape");
      await expect(
        page.locator('[data-ui-theme="light"]').first(),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.locator('[data-ui-theme="light"]').first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Мобильная задача/ }),
      ).toBeVisible();
      await page.screenshot({
        path: resolve(directory, "task-manager-light.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: "Профиль: Task owner fixture",
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitemradio", { name: "Тёмная", exact: true })
        .click();
      await page.keyboard.press("Escape");
      await expect(
        page.locator('[data-ui-theme="dark"]').first(),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.locator('[data-ui-theme="dark"]').first(),
      ).toBeVisible();
    });
    expect(errors).toEqual([]);
  });
});

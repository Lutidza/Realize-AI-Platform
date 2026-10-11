/**
 * @file tests/e2e/task-manager.spec.ts
 * @version 1.0.0
 * @date 2026-10-11
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
      await page.goto("/system/task-manager");
      await expect(page).toHaveURL(/\/admin\/login\?/);
      expect(new URL(page.url()).searchParams.get("redirect")).toBe(
        "/system/task-manager",
      );
      await login("task-customer@example.test");
      expect(
        (
          await page.request.get("/api/task-manager/projects", { headers })
        ).status(),
      ).toBe(403);
      await page.goto("/system/task-manager");
      await expect(page).toHaveURL(/\/admin\/unauthorized/);
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
      await expect(begin).toBeVisible();
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
      await page.screenshot({
        path: resolve(directory, "task-manager-mobile.png"),
        fullPage: true,
      });
      await writeFile(
        resolve(process.env.TASK_BROWSER_LOGS_DIR!, "browser-evidence.json"),
        JSON.stringify(
          {
            desktop: { width: 1440, height: 1000 },
            mobile: { ...layout, height: 844 },
            conflictStatus: 409,
            historyEvents: 3,
            pageErrors: errors,
          },
          null,
          2,
        ),
      );
    });
    expect(errors).toEqual([]);
  });
});

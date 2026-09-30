/**
 * @file tests/e2e/design-workshop.e2e.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет настоящие формы, версии, конфликт, навигацию и ACL Мастерской на отдельной БД.
 * @see documentation/specifications/design-workshop.md
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect as playwrightExpect, test } from "@playwright/test";
import type { DesignMutationReceiptDto } from "@realize/ai-contracts";
const expect = playwrightExpect.configure({ timeout: 20000 });

test("Workshop creates, reviews, applies and restores real project revisions", async ({
  page,
  browser,
}) => {
  test.setTimeout(360000);
  test.skip(
    !process.env.WORKSHOP_TEST_DATABASE_URI ||
      !process.env.WORKSHOP_BROWSER_AUTH_FILE,
    "Требуется отдельная БД и её одноразовые пользователи.",
  );
  const database = new URL(process.env.WORKSHOP_TEST_DATABASE_URI!);
  if (
    database.hostname !== "127.0.0.1" ||
    !/^realize_workshop_fixture_[a-z0-9]+$/.test(database.pathname.slice(1)) ||
    database.href !== process.env.DATABASE_URI
  )
    throw Error("ISOLATED_WORKSHOP_DATABASE_REQUIRED");
  const auth = JSON.parse(
    await readFile(process.env.WORKSHOP_BROWSER_AUTH_FILE!, "utf8"),
  );
  for (const role of ["admin", "other", "customer"]) {
    if (!/^workshop-ui-[a-f0-9-]+@example.invalid$/.test(auth[role]?.email))
      throw Error("DISPOSABLE_USERS_REQUIRED");
  }
  const root = resolve(
    ".ai-workspace/tasks/2026-09-20-internal-mcp-audit-7c4e",
  );
  await mkdir(root + "/screenshots", { recursive: true });
  const api = "/api/realize-ai/workshop/projects";
  const headers = { "Sec-Fetch-Site": "same-origin" };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const login = await page.request.post("/api/users/login", {
    data: auth.admin,
    timeout: 120000,
  });
  expect(login.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/system/workshop", { timeout: 120000 });
  await expect(
    page.getByRole("heading", { name: "Мастерская", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Новый проект", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Новый дизайн-проект" });
  await expect(create.getByLabel("Название проекта")).toBeFocused();
  const title = "Task Manager · " + randomUUID().slice(0, 6);
  await create.getByLabel("Название проекта").fill(title);
  await create
    .getByLabel("Что создаём")
    .fill("Рабочее пространство для управления задачами команды");
  await create
    .getByLabel("Для кого")
    .fill("Администраторы и участники команды");
  await create
    .getByLabel("Критерии готовности")
    .fill(
      "Навигация доступна с клавиатуры\nНа мобильном экране нет горизонтальной прокрутки",
    );
  await page.screenshot({
    path: root + "/screenshots/workshop-create-desktop.png",
    fullPage: true,
  });
  await create
    .getByRole("button", { name: "Создать проект", exact: true })
    .click();
  await expect(page).toHaveURL(/\/system\/workshop\/[a-f0-9-]+$/, {
    timeout: 120000,
  });
  await expect(
    page.getByRole("heading", { name: title, level: 1 }),
  ).toBeVisible();
  const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(
    page.getByText("Все изменения сохранены", { exact: false }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Файлы", exact: true }).click();
  await page
    .getByLabel("Путь нового файла")
    .fill("src/components/TaskView.tsx");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  const contents =
    "export function TaskView() {\n  return <main><h1>Задачи команды</h1></main>;\n}\n// <script>window.workshopInjected = true</script>\n";
  await page
    .getByLabel("Содержимое src/components/TaskView.tsx", { exact: true })
    .fill(contents);
  await page
    .getByLabel("Что изменилось", { exact: true })
    .fill("Добавлен первый компонент");
  await page
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Проверка изменений" });
  await expect(review).toBeVisible();
  await review
    .locator("summary")
    .filter({ hasText: "src/components/TaskView.tsx" })
    .click();
  await expect(review.getByText("Файла нет", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => "workshopInjected" in window)).toBe(false);
  await page.screenshot({
    path: root + "/screenshots/workshop-review-desktop.png",
    fullPage: true,
  });
  await review
    .getByRole("button", { name: "Применить изменения", exact: true })
    .click();
  await expect(
    page.getByText("Версия 2 сохранена.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Файлы", exact: true }).click();
  await expect(
    page.getByLabel("Содержимое src/components/TaskView.tsx", { exact: true }),
  ).toHaveValue(contents);
  await page.screenshot({
    path: root + "/screenshots/workshop-files-desktop.png",
    fullPage: true,
  });

  // Другая сессия сохраняет новую базу, пока открытый редактор хранит свой draft.
  const current = await page.request.get(api + "/" + projectId, { headers });
  expect(current.status()).toBe(200);
  const currentData = (await current.json()).data;
  await page.getByRole("tab", { name: "Бриф", exact: true }).click();
  await page.getByLabel("Что создаём").fill("Черновик для проверки отмены");
  await page
    .getByRole("button", { name: "Отменить черновик", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Отмена", exact: true })
    .click();
  await expect(page.getByLabel("Что создаём")).toHaveValue(
    "Черновик для проверки отмены",
  );
  await page
    .getByRole("button", { name: "Отменить черновик", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Отменить черновик", exact: true })
    .click();
  await expect(
    page.getByText("Несохранённый черновик отменён.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Что создаём")
    .fill("Локальный черновик после параллельной правки");
  await page
    .getByLabel("Что изменилось", { exact: true })
    .fill("Уточнена цель");
  const prepared = await page.request.post(
    api + "/" + projectId + "/changes/prepare",
    {
      headers: { ...headers, "Idempotency-Key": randomUUID() },
      data: {
        baseRevisionId: currentData.currentRevision.revisionId,
        summary: "Параллельная заметка",
        operations: [],
        sources: [
          {
            kind: "note",
            title: "Из другой сессии",
            text: "Проверка конфликта",
          },
        ],
      },
    },
  );
  expect(prepared.status()).toBe(200);
  const preparedReceipt = (await prepared.json())
    .data as DesignMutationReceiptDto;
  const applied = await page.request.post(
    api + "/" + projectId + "/changes/" + preparedReceipt.changeId + "/apply",
    { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: {} },
  );
  expect(applied.status()).toBe(200);
  await page
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Что создаём")).toHaveValue(
    "Локальный черновик после параллельной правки",
  );
  await page
    .getByRole("button", { name: "Обновить базу", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Обновить базу", exact: true })
    .click();
  await expect(
    page.getByText("База обновлена.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  await expect(
    review.getByText("Из другой сессии", { exact: false }),
  ).toBeVisible();
  await review
    .getByRole("button", { name: "Применить изменения", exact: true })
    .click();
  await expect(
    page.getByText("Версия 4 сохранена.", { exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Версии", exact: true }).click();
  await page.getByRole("button", { name: "Версия 1", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Версия 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Взять версию 1 за основу", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Взять за основу", exact: true })
    .click();
  await page
    .getByLabel("Что изменилось", { exact: true })
    .fill("Восстановлен исходный бриф");
  await page
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  await expect(review.getByText("Удалён", { exact: true })).toBeVisible();
  await review
    .getByRole("button", { name: "Применить изменения", exact: true })
    .click();
  await expect(
    page.getByText("Версия 5 сохранена.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Что создаём")).toHaveValue(
    "Рабочее пространство для управления задачами команды",
  );
  await page.getByRole("tab", { name: "Версии", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Версия 5 · текущая", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: root + "/screenshots/workshop-history-desktop.png",
    fullPage: true,
  });

  // Обе темы и адаптивная форма; проверяем реальную ширину scroll container.
  await page.getByRole("button", { name: "Светлая", exact: true }).click();
  await page.getByRole("tab", { name: "Бриф", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => {
      const main = document.querySelector("main")!;
      return (
        main.scrollWidth <= main.clientWidth + 1 &&
        document.documentElement.scrollWidth <= innerWidth
      );
    }),
  ).toBe(true);
  await page.screenshot({
    path: root + "/screenshots/workshop-project-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Открыть навигацию", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Открыть навигацию", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 768, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin", { timeout: 120000 });
  const openMenu = page.getByRole("button", { name: "Open Menu", exact: true });
  const entry = page.getByRole("link", { name: "Мастерская", exact: true });
  await expect(entry).toHaveAttribute("href", "/system/workshop");
  await expect(
    page.getByRole("button", { name: /^(Open|Close) Menu$/ }),
  ).toBeVisible();
  if (await openMenu.isVisible()) await openMenu.click();
  await entry.click({ timeout: 15000 });
  await expect(
    page.getByRole("heading", { name: "Мастерская", level: 1 }),
  ).toBeVisible();
  await page.getByLabel("Найти проект", { exact: true }).fill(title);
  await expect(
    page.getByRole("link", { name: new RegExp(title.replaceAll("·", ".")) }),
  ).toBeVisible();
  await page.screenshot({
    path: root + "/screenshots/workshop-library-with-project.png",
    fullPage: true,
  });
  await page
    .getByLabel("Найти проект", { exact: true })
    .fill("Нет такого проекта");
  await expect(
    page.getByRole("heading", { name: "Проекты не найдены", exact: true }),
  ).toBeVisible();

  for (const role of ["anonymous", "customer", "other"]) {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL,
    });
    try {
      if (role !== "anonymous")
        expect(
          (
            await context.request.post("/api/users/login", { data: auth[role] })
          ).status(),
        ).toBe(200);
      const response = await context.request.get(api + "/" + projectId, {
        headers,
      });
      expect(response.status()).toBe(
        role === "anonymous" ? 401 : role === "customer" ? 403 : 404,
      );
      if (role === "anonymous") {
        const guarded = await context.request.get("/system/workshop", {
          maxRedirects: 0,
        });
        expect(guarded.status()).toBe(307);
        expect(guarded.headers().location).toContain("/admin/login");
      }
    } finally {
      await context.close();
    }
  }
  expect(errors).toEqual([]);
  await writeFile(
    root + "/tmp/workshop-ui-browser-result.json",
    JSON.stringify(
      {
        ok: true,
        projectId,
        versions: 5,
        viewports: [1440, 768, 390],
        themes: ["dark", "light"],
        pageErrors: errors,
        tested: [
          "create",
          "prepare-review-apply",
          "reload",
          "conflict-draft-preservation",
          "restore-new-version",
          "payload-navigation",
          "search",
          "mobile-focus",
          "ACL",
        ],
      },
      null,
      2,
    ),
  );
});

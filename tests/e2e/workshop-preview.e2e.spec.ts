/**
 * @file tests/e2e/workshop-preview.e2e.spec.ts
 * @version 1.0.1
 * @date 2026-09-30
 * @description Проверяет MCP-проект в Admin, настоящий capture/reload, историческую версию, ошибки и права preview.
 * @see documentation/specifications/design-workshop.md
 */
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect as playwrightExpect } from "@playwright/test";
const expect = playwrightExpect.configure({ timeout: 20000 });

test("MCP project previews in Admin with version identity, cancellation and responsive controls", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  test.skip(
    !process.env.WORKSHOP_CHANNELS_BROWSER_AUTH,
    "Нужны одноразовые MCP/Workshop пользователи и настоящий preview worker.",
  );
  const database = new URL(process.env.DATABASE_URI!);
  if (
    database.hostname !== "127.0.0.1" ||
    database.port !== "40261" ||
    !/^\/realize_mcp_fixture_workshop[a-z0-9]+$/.test(database.pathname)
  )
    throw Error("ISOLATED_WORKSHOP_CHANNELS_DATABASE_REQUIRED");
  const auth = JSON.parse(
    await readFile(process.env.WORKSHOP_CHANNELS_BROWSER_AUTH!, "utf8"),
  );
  if (!/^mcp-workshop-[a-f0-9-]+@example.invalid$/.test(auth.admin.email))
    throw Error("DISPOSABLE_WORKSHOP_USER_REQUIRED");
  const evidence = resolve(
    ".ai-workspace/tasks/2026-09-20-internal-mcp-audit-7c4e/screenshots/workshop-channels",
  );
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  expect(
    (await page.request.post("/api/users/login", { data: auth.admin })).ok(),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const route = "/system/workshop/" + auth.projectId;
  const api = "/api/realize-ai/workshop/projects/" + auth.projectId;
  await page.goto(route);
  await expect(
    page.getByRole("heading", {
      name: "Мастерская · MCP → Admin",
      exact: true,
    }),
  ).toBeVisible();
  const previewTab = () =>
    page.getByRole("tab", { name: "Предпросмотр", exact: true });
  await previewTab().click();
  const preview = page.getByRole("region", { name: "Предпросмотр макета" });
  const start = preview.getByRole("button", {
    name: "Создать preview",
    exact: true,
  });
  await expect(start).toBeEnabled();
  await expect(preview.getByLabel("Главный React-компонент")).toHaveValue(
    "src/Preview.tsx",
  );
  const posted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(api + "/previews"),
  );
  await start.click();
  const response = await posted;
  expect(response.ok()).toBe(true);
  const firstJob = (await response.json()).data;
  await page.reload();
  await previewTab().click();
  const image = preview.getByRole("img");
  await expect(image).toBeVisible({ timeout: 90000 });
  await expect(image).toHaveAttribute(
    "alt",
    "Макет, версия 1, ширина 1440 пикселей",
  );
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBe(1440);
  await page.screenshot({
    path: evidence + "/preview-desktop.png",
    fullPage: true,
  });
  for (const width of [768, 390]) {
    await preview
      .getByRole("button", { name: `${width} px`, exact: true })
      .click();
    await expect
      .poll(() =>
        image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBe(width);
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: evidence + `/preview-${width}.png`,
      fullPage: true,
    });
  }
  await preview.getByRole("button", { name: "390 px", exact: true }).focus();
  await expect(
    preview.getByRole("button", { name: "390 px", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    preview.getByRole("button", { name: "768 px", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    preview.getByRole("button", { name: "768 px", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const edit = async (content: string, number: number) => {
    await page.getByRole("tab", { name: "Файлы", exact: true }).click();
    await page.getByLabel("Выбранный файл").selectOption("src/Preview.tsx");
    await page
      .getByLabel("Содержимое src/Preview.tsx", { exact: true })
      .fill(content);
    await previewTab().click();
    await expect(start).toBeDisabled();
    await expect(
      preview.getByText("Сначала сохраните изменения:", { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel("Что изменилось", { exact: true })
      .fill("Проверка preview версии " + number);
    await page
      .getByRole("button", { name: "Проверить изменения", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Проверка изменений" })
      .getByRole("button", { name: "Применить изменения", exact: true })
      .click();
    await expect(
      page.getByText(`Версия ${number} сохранена.`, { exact: true }),
    ).toBeVisible();
  };
  await edit(
    "export default function App(){return <h1>Новая версия из редактора</h1>}",
    2,
  );
  await expect(
    preview.getByText("другая сохранённая версия", { exact: false }),
  ).toBeVisible();
  await expect(image).toHaveAttribute("alt", /версия 1/);
  await start.click();
  await expect(image).toHaveAttribute("alt", /версия 2/, { timeout: 90000 });
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);

  await edit("export default function App( {", 3);
  await start.click();
  await expect(preview.getByRole("alert")).toContainText("Макет не собрался", {
    timeout: 90000,
  });
  await expect(image).toHaveCount(0);
  await page.screenshot({
    path: evidence + "/preview-build-error.png",
    fullPage: true,
  });
  await edit("export default function App(){while(true){}return null}", 4);
  await start.click();
  await expect(
    preview.getByRole("button", { name: "Отменить preview", exact: true }),
  ).toBeEnabled();
  await preview
    .getByRole("button", { name: "Отменить preview", exact: true })
    .click();
  await expect(preview.getByRole("status")).toContainText("Отменено");
  await expect(start).toBeEnabled();

  const anonymous = await browser.newContext();
  try {
    expect(
      (
        await anonymous.request.get(
          new URL(`${api}/previews/${firstJob.jobId}/images/390`, page.url())
            .href,
        )
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
  const other = await browser.newContext();
  try {
    expect(
      (
        await other.request.post(new URL("/api/users/login", page.url()).href, {
          data: auth.other,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await other.request.get(
          new URL(`${api}/previews/${firstJob.jobId}/images/390`, page.url())
            .href,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }

  await page.goto("/admin/mcp-servers/" + auth.serverID);
  const clients = page.getByRole("region", { name: "Клиенты MCP" });
  const read = clients.getByRole("switch", {
    name: "Мастерская: читать мои проекты",
    exact: true,
  });
  const write = clients.getByRole("switch", {
    name: "Мастерская: создавать проекты и сохранять правки",
    exact: true,
  });
  const capture = clients.getByRole("switch", {
    name: "Мастерская: запускать и просматривать preview",
    exact: true,
  });
  await expect(write).toBeDisabled();
  await expect(capture).toBeDisabled();
  await read.focus();
  await page.keyboard.press("Space");
  await expect(write).toBeEnabled();
  await expect(capture).toBeEnabled();
  await write.check();
  await capture.check();
  await read.uncheck();
  await expect(write).not.toBeChecked();
  await expect(capture).not.toBeChecked();
  await clients.screenshot({ path: evidence + "/mcp-workshop-grants.png" });
  expect(errors).toEqual([]);
});

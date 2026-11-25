/**
 * @file scripts/runtime/audit-dossier-preview/verifyAuditDossierBrowser.controller.mjs
 * @version 1.0.0
 * @date 2026-11-26
 * @description Проверяет доступ к сохранённому досье через сессию браузера, три материала и переход из рабочей карточки.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import {
  previewOrigin,
  readPreviewScope,
  readPrivatePreviewFile,
} from "./auditDossierPreview.config.mjs";

const scope = await readPreviewScope();
const { projectId } = JSON.parse(
  await readFile(join(scope.state, "manifest.json"), "utf8"),
);
const path = `/system/task-manager/${scope.taskId}/dossier/${scope.decisionId}`;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    baseURL: previewOrigin,
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === previewOrigin &&
      url.pathname.startsWith("/api/task-manager/")
    )
      console.log(response.status(), url.pathname);
  });
  page.setDefaultTimeout(120000);
  const guest = await context.request.get(path, {
    maxRedirects: 0,
    timeout: 180000,
  });
  assert.ok(
    [303, 307, 308].includes(guest.status()),
    `guest: HTTP ${guest.status()}`,
  );
  const login = new URL(guest.headers().location, previewOrigin);
  assert.equal(login.origin, previewOrigin);
  assert.equal(login.pathname, "/admin/login");
  assert.equal(login.searchParams.get("redirect"), path);

  const { email, password } = JSON.parse(
    await readPrivatePreviewFile(scope.loginFile),
  );
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 180000 });
  assert.equal(new URL(page.url()).pathname, login.pathname);
  const form = page
    .locator("form")
    .filter({ has: page.locator("input[type=password]") });
  await form.locator('input[name="email"]').fill(email);
  await form
    .locator('input[type="password"]')
    .fill(password)
    .catch(() => {
      throw new Error("Поле пароля на стенде недоступно.");
    });
  const [signedIn] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/users/login" &&
        response.request().method() === "POST",
    ),
    form.locator('button[type="submit"]').click(),
  ]);
  assert.equal(signedIn.status(), 200, "Вход тестового оркестратора");
  assert.ok(
    (await context.cookies(previewOrigin)).some((cookie) => cookie.httpOnly),
  );

  await page.waitForURL((url) => url.pathname === path);
  const heading = page.getByRole("heading", {
    name: "Проверить форму создания статьи",
    exact: true,
  });
  await expect(heading).toBeVisible({ timeout: 120000 });
  assert.equal(new URL(page.url()).pathname, path);
  console.log("Вход через браузер выполнен. Открыта задача тестового прогона.");
  const report = page.getByRole("region", { name: "Отчёт аудитора" });
  const conclusion = page.getByRole("region", { name: "Заключение ревьюера" });
  const decision = page.getByRole("region", { name: "Решение оркестратора" });
  await expect(report).toContainText(
    "Маршрут открывает форму после проверки доступа.",
  );
  await expect(report).toContainText("matchesSubmittedDocumentArticle");
  await expect(conclusion).toContainText(
    "Отчёт подтверждён по четырём критериям.",
  );
  await expect(conclusion.getByRole("heading", { level: 3 })).toHaveCount(4);
  await expect(conclusion.locator("blockquote")).toHaveCount(4);
  await expect(decision).toContainText("Аудит принят");
  await expect(decision).toContainText(
    "Выводы и границы аудита формы подтверждены по четырём критериям.",
  );
  const desktop = await decision.innerText();
  console.log(
    "На странице сверены отчёт, четыре оценки с цитатами и решение о приёмке.",
  );

  await page.goto("/system/task-manager", { waitUntil: "domcontentloaded" });
  const projects = page
    .getByRole("combobox", { name: "Проект", exact: true })
    .first();
  await expect(projects.locator(`option[value="${projectId}"]`)).toHaveCount(
    1,
    { timeout: 90000 },
  );
  if ((await projects.inputValue()) !== projectId)
    await projects.selectOption(projectId);
  await page
    .getByRole("button", { name: /Проверить форму создания статьи/ })
    .click();
  const link = page.getByRole("link", { name: "Досье аудита", exact: true });
  await expect(link).toHaveAttribute("href", path);
  const materials = page.getByRole("navigation", { name: "Материалы аудита" });
  for (const [label, fragment] of [
    ["Отчёт аудитора", "audit-report"],
    ["Заключение ревьюера", "review-conclusion"],
    ["Решение оркестратора", "acceptance-decision"],
  ]) {
    await expect(materials.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      path + "#" + fragment,
    );
  }
  await Promise.all([
    page.waitForURL((url) => url.pathname === path),
    link.click(),
  ]);
  await expect(heading).toBeVisible({ timeout: 120000 });
  assert.equal(new URL(page.url()).pathname, path);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(decision).toBeVisible();
  assert.equal(await decision.innerText(), desktop);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  const unknown = path.replace(
    scope.decisionId,
    "89000000-0000-4000-8000-000000000000",
  );
  const denied = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      redirect: "error",
    });
    return response.status;
  }, unknown);
  assert.equal(denied, 404, "Постороннее решение");
  console.log(
    `Досье: ${previewOrigin}${path}\nВход, отчёт, четыре оценки, решение, ссылка из карточки, мобильный экран, обновление и отказ для чужого ID проверены.`,
  );
} finally {
  await browser.close();
}

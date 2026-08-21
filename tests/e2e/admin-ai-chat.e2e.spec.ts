/**
 * @file tests/e2e/admin-ai-chat.e2e.spec.ts
 * @version 2026-08-21
 * @description Verifies global chat, execution, local preview and acceptance UI.
 */

import { expect, test } from "@playwright/test";

import {
  ADMIN_AI_FINAL_ANSWER,
  ADMIN_AI_USER_MESSAGE,
  installAdminAIChatScenario,
} from "./support/adminAIChatScenario";
import {
  provisionPayloadAdmin,
  removePayloadAdmin,
  type PayloadAdminFixture,
} from "./support/payloadAdmin";

test("keeps the modern assistant available across Admin and binds plan approval", async ({
  page,
}) => {
  let admin: PayloadAdminFixture | undefined;
  try {
    await page.setViewportSize({ height: 1_000, width: 1_440 });
    admin = await provisionPayloadAdmin(page.request);
    const login = await page.request.post("/api/users/login", {
      data: { email: admin.email, password: admin.password },
    });
    expect(login.ok()).toBe(true);

    await installAdminAIChatScenario(page);

    await page.goto("/admin/collections/pages");
    const launcher = page.getByRole("button", {
      name: "Открыть AI-ассистента",
    });
    await expect(launcher).toBeVisible();
    await launcher.click();
    const drawer = page.locator(".drawer__content");
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Project copilot · approval-gated"),
    ).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole("textbox", { name: "Сообщение ассистенту" })
      .fill(ADMIN_AI_USER_MESSAGE);
    await page.getByRole("button", { name: "Отправить" }).click();

    const progress = page.getByTestId("run-progress");
    await expect(progress).toContainText("Проверяю durable state");
    await expect(progress).toContainText("Поток ответа прерван");
    await progress
      .getByRole("button", { name: "Повторить подключение" })
      .click();
    await expect(page.getByText(ADMIN_AI_FINAL_ANSWER)).toBeVisible({
      timeout: 10_000,
    });
    await expect(progress).toHaveCount(0);

    await page.getByRole("button", { name: "Оформить Change Request" }).click();
    const changeCard = page.getByTestId("change-request-card");
    await expect(changeCard).toContainText("R3");
    await changeCard.getByText("Проверить scope и план").click();
    await expect(changeCard).toContainText("src/components/Header/index.tsx");
    await changeCard.getByRole("button", { name: "Утвердить план v1" }).click();
    await expect(changeCard).toContainText("План утверждён");
    await changeCard
      .getByRole("button", { name: "Запустить изменение" })
      .click();
    const evidence = changeCard.getByTestId("execution-evidence");
    await expect(evidence).toContainText("Проверки пройдены", {
      timeout: 10_000,
    });
    await evidence.getByText("Diff и evidence", { exact: true }).click();
    await expect(evidence).toContainText("npm run typecheck");
    await expect(evidence).toContainText("verified e2e change");
    await evidence
      .getByRole("button", { name: "Принять diff и evidence" })
      .click();
    await expect(changeCard).toContainText("Результат принят");
    await changeCard.getByRole("button", { name: "Создать preview" }).click();
    const preview = changeCard.getByTestId("preview-evidence");
    await expect(preview).toContainText("Preview готов", { timeout: 10_000 });
    await preview.getByText("Review и evidence", { exact: true }).click();
    await expect(preview).toContainText("Independent reviewer");
    await expect(preview).toContainText("playwright preview smoke");
    await expect(
      preview.getByRole("link", { name: /Открыть local preview/ }),
    ).toHaveAttribute("href", "http://127.0.0.1:3200");
    await preview
      .getByRole("button", { name: "Принять artifact и preview" })
      .click();
    await expect(changeCard).toContainText("Preview принят");
    await page.screenshot({
      path: "documentation/reports/evidence/admin-ai-chat-desktop.png",
    });

    await page.getByRole("button", { name: "Закрыть AI-ассистента" }).click();
    await page.goto("/admin/collections/users");
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.getByText(ADMIN_AI_FINAL_ANSWER).first()).toBeVisible();
    await expect(page.getByTestId("change-request-card")).toContainText(
      "Preview принят",
    );

    await page.reload();
    await page.getByRole("button", { name: "Открыть AI-ассистента" }).click();
    await expect(page.getByText(ADMIN_AI_FINAL_ANSWER).first()).toBeVisible();
    await expect(page.getByTestId("change-request-card")).toContainText(
      "Preview принят",
    );

    await page.getByRole("button", { name: "Закрыть AI-ассистента" }).click();
    await page.setViewportSize({ height: 844, width: 390 });
    await page.getByRole("button", { name: "Открыть AI-ассистента" }).click();
    await expect(drawer).toBeVisible();
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox?.width).toBeLessThanOrEqual(391);
    await expect(
      page.getByRole("textbox", { name: "Сообщение ассистенту" }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "documentation/reports/evidence/admin-ai-chat-mobile.png",
    });
  } finally {
    if (admin) await removePayloadAdmin(admin);
  }
});

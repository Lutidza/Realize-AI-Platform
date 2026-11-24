/**
 * @file tests/e2e/control-panel-surface-radius.e2e.spec.ts
 * @version 1.0.0
 * @date 2026-11-24
 * @description Сверяет радиусы области контента и карточки с боковой панелью в браузере.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { expect, test } from "@playwright/test";

for (const layout of ["default", "without-topbar"]) {
  for (const mode of ["light", "dark"]) {
    test(`углы поверхностей совпадают с sidebar в ${layout}, ${mode}`, async ({
      page,
    }) => {
      await page.goto(
        `/reference/control-panel/document?layout=${layout}&mode=${mode}`,
      );
      const frame = page.locator(`[data-control-panel-layout="${layout}"]`);
      const sidebar = frame.locator('[data-panel-region="sidebar"]');
      const content = frame.locator('[data-panel-region="panel-content"]');
      const card = content.getByRole("article");

      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(card).toBeVisible();
        for (const element of [sidebar, content, card]) {
          await expect(element).toHaveCSS("border-radius", "14px");
        }
      }
    });
  }
}

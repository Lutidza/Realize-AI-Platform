/**
 * @file tests/int/changePlanRouting.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Проверяет разделение Data Lane и code plans и разбор путей из Markdown.
 */

import { ChangePlanError, deriveChangePlan } from "@realize/change-engine";
import { describe, expect, it } from "vitest";

describe("code plan routing", () => {
  it.each([
    '{"version":"1.0","kind":"pages.createDraft.v1","title":"О нас","slug":"about","sections":[{"body":"Демо"}]}',
    '{"version":"1.0","kind":"catalog.assignCategory.v1","product":{"id":"1"},"category":{"id":"2"}}',
    '{"kind":"pages.createDraft.v1",',
  ])(
    "rejects a data proposal even when the answer mentions source files: %s",
    (proposal) => {
      expect(() =>
        deriveChangePlan({
          originalRequest: "Создай страницу",
          plan: `Используем src/collections/Pages/index.ts для страницы.\n\`\`\`realize-data-operation\n${proposal}\n\`\`\``,
        }),
      ).toThrow("Используйте «Подготовить изменение данных»");
    },
  );

  it("reads Markdown labels without appending absolute workspace destinations", () => {
    const plan = deriveChangePlan({
      originalRequest: "Исправь отображение страницы",
      plan: [
        "Исправить [src/app/(app)/[slug]/page.tsx](/tmp/realize-ai-context-Fg6ACG/src/app/(app)/[slug]/page.tsx).",
        "Проверить [src/collections/Pages/index.ts](/home/gio/www/Realize-E-Commerce/src/collections/Pages/index.ts:42).",
        "Проверки: npm run typecheck.",
      ].join("\n"),
    });
    expect(plan.affectedPaths).toEqual([
      "src/app/(app)/[slug]/page.tsx",
      "src/collections/Pages/index.ts",
    ]);
  });

  it("preserves balanced Next route directory names and deduplicates relative link targets", () => {
    const plan = deriveChangePlan({
      originalRequest: "Исправь компоненты маршрута",
      plan: "Обновить `src/app/(app)/[slug]`, [src/components/Header/index.tsx](src/components/Header/index.tsx) и (src/app/(app)).",
    });
    expect(plan.affectedPaths).toEqual([
      "src/app/(app)",
      "src/app/(app)/[slug]",
      "src/components/Header/index.tsx",
    ]);
  });

  it("does not turn absolute paths or traversal into an approved repository scope", () => {
    expect(() =>
      deriveChangePlan({
        originalRequest: "Исправь страницу",
        plan: "Изменить /tmp/workspace/src/app/page.tsx и src/../../outside.ts, затем проверить результат.",
      }),
    ).toThrow(ChangePlanError);
  });

  it("recognizes explicit root configuration files and ./ paths", () => {
    const plan = deriveChangePlan({
      originalRequest: "Уточни настройки маршрута",
      plan: "Обновить `next.config.ts`, `./src/app/(app)/[slug]/page.tsx` и [README.md](README.md). Затем проверить npm run typecheck.",
    });
    expect(plan.affectedPaths).toEqual([
      "README.md",
      "next.config.ts",
      "src/app/(app)/[slug]/page.tsx",
    ]);
  });

  it("does not extract root filename prefixes from secrets, URLs or different filenames", () => {
    expect(() =>
      deriveChangePlan({
        originalRequest: "Проанализируй упомянутые файлы",
        plan: "Упомянуты .env.local, /tmp/project/package.json, https://example.com/README.md, next.config.ts.backup и package.jsonl; точного scope нет.",
      }),
    ).toThrow(ChangePlanError);
  });
});

/**
 * @file tests/int/changePlanRouting.int.spec.ts
 * @version 2.0.1
 * @date 2026-09-15
 * @description Проверяет явную область записи code plan, отделение источников и строгие отказы протокола.
 */

import {
  ChangePlanError,
  assessChangePlanReadiness,
  deriveChangePlan,
} from "@realize/change-engine";
import { describe, expect, it } from "vitest";
import { parseCodePlan } from "../../packages/change-engine/src/parseCodePlan.validator";

const block = (value: unknown): string =>
  ["```realize-code-plan", JSON.stringify(value), "```"].join("\n");
const entry = (
  path = "src/components/Header/index.tsx",
  change = "Добавить кнопку открытия навигации.",
) => ({ path, change });
const proposal = (files = [entry()]) => ({ version: "1.0", files });
const derive = (plan: string) =>
  deriveChangePlan({ originalRequest: "Исправь отображение страницы", plan });
const expectInvalid = (plan: string) => {
  expect(parseCodePlan(plan)).toBeNull();
  expect(assessChangePlanReadiness(plan)).toEqual({
    status: "needs_clarification",
    reason: "missing_paths",
  });
  expect(() => derive(plan)).toThrow(ChangePlanError);
};

describe("explicit code plan routing", () => {
  it.each([
    '{"version":"1.0","kind":"pages.createDraft.v1","title":"О нас","slug":"about","sections":[{"body":"Демо"}]}',
    '{"version":"1.0","kind":"catalog.assignCategory.v1","product":{"id":"1"},"category":{"id":"2"}}',
    '{"kind":"pages.createDraft.v1",',
  ])(
    "retains Data Lane precedence even beside a valid code plan: %s",
    (dataProposal) => {
      const plan = `${block(proposal())}\n\`\`\`realize-data-operation\n${dataProposal}\n\`\`\``;
      expect(assessChangePlanReadiness(plan)).toEqual({
        status: "unavailable",
        reason: "data_operation",
      });
      expect(() => derive(plan)).toThrow(
        "Используйте «Подготовить изменение данных»",
      );
    },
  );

  it("uses only explicit files and ignores unrelated prose, read citations and descriptions", () => {
    const path = "src/app/(app)/[slug]/page.tsx";
    const plan = [
      "Изучены [README.md](/tmp/workspace/README.md) и src/collections/Pages/index.ts.",
      "Не изменять package.json; справочная ссылка [компонент](src/components/Other.tsx).",
      block(
        proposal([entry(path, "Обновить заголовок по описанию из README.md.")]),
      ),
      "Проверки: npm run typecheck.",
    ].join("\n");
    expect(derive(plan).affectedPaths).toEqual([path]);
  });

  it("allows an explicit README-only write instead of blacklisting its name", () => {
    const plan = block(
      proposal([entry("README.md", "Уточнить команду запуска проекта.")]),
    );
    expect(derive(plan).affectedPaths).toEqual(["README.md"]);
    expect(derive(plan).checks).toEqual([
      "node scripts/security/check-secrets.mjs",
      "npm run lint",
      "npm run typecheck",
      "npm run test:int",
      "npm run build",
    ]);
  });

  it("normalizes ./ while preserving exact Next catch-all, route-group and parallel-route file paths", () => {
    const paths = [
      "src/app/(app)/[slug]/page.tsx",
      "src/app/[...segments]/page.tsx",
      "src/app/[[...segments]]/page.tsx",
      "src/app/@modal/(.)photo/page.tsx",
      "Dockerfile",
      "Makefile",
      "LICENSE",
      ".gitignore",
    ];
    const parsed = parseCodePlan(
      block(
        proposal(
          paths.map((path) =>
            entry(`./${path}`, "  Обновить содержимое файла.  "),
          ),
        ),
      ),
    );
    expect(parsed?.files).toEqual(
      paths.map((path) => entry(path, "Обновить содержимое файла.")),
    );
    expect(
      derive(block(proposal(paths.map((path) => entry(`./${path}`)))))
        .affectedPaths,
    ).toEqual([...paths].sort());
  });

  it.each([
    "/tmp/workspace/src/app/page.tsx",
    "https://example.test/src/app/page.tsx",
    "src/../../outside.ts",
    "src/./page.tsx",
    "src\\app\\page.tsx",
    "src/app/page.tsx?raw=1",
    "src/app/page.tsx#heading",
    "src/app/page.tsx:42",
    "[src/app/page.tsx](src/app/page.tsx)",
    "src/app/[slug/page.tsx",
    "src/app/*.tsx",
    "src/app/**",
    "src/app/",
    "src/components/Header",
    "src/app//page.tsx",
    "src/app/%2e%2e/page.tsx",
  ])("rejects the whole scope for a non-exact or unsafe path: %s", (path) => {
    expectInvalid(block(proposal([entry("README.md"), entry(path)])));
  });

  it.each([
    { name: "unknown root key", value: { ...proposal(), checks: [] } },
    {
      name: "unknown file key",
      value: { version: "1.0", files: [{ ...entry(), mode: "read" }] },
    },
    { name: "unsupported version", value: { ...proposal(), version: "2.0" } },
    {
      name: "missing description",
      value: { version: "1.0", files: [{ path: "README.md" }] },
    },
    {
      name: "empty description",
      value: proposal([entry("README.md", " \n ")]),
    },
    {
      name: "oversized description",
      value: proposal([entry("README.md", "x".repeat(2001))]),
    },
    {
      name: "non-string description",
      value: { version: "1.0", files: [{ path: "README.md", change: 1 }] },
    },
    {
      name: "oversized path",
      value: proposal([entry(`src/${"x".repeat(240)}.ts`)]),
    },
    { name: "empty files", value: proposal([]) },
    {
      name: "too many files",
      value: proposal(
        Array.from({ length: 101 }, (_, i) => entry(`src/file-${i}.ts`)),
      ),
    },
    {
      name: "normalized duplicate",
      value: proposal([entry("README.md"), entry("./README.md")]),
    },
    { name: "non-object root", value: [proposal()] },
  ])("rejects malformed contracts atomically: $name", ({ value }) => {
    expectInvalid(block(value));
  });

  it("rejects malformed, truncated and multiple blocks without recovering scope from prose", () => {
    const valid = block(proposal());
    for (const invalid of [
      "```realize-code-plan\n{broken}\n```",
      valid.slice(0, -3),
      `${valid}\n${valid}`,
      `${valid}\n\`\`\`realize-code-plan\n{`,
      valid.replace("realize-code-plan", "realize-code-plan extra"),
    ])
      expectInvalid(`Использован README.md.\n${invalid}`);
  });

  it.each(["````text", "```text", "~~~text"])(
    "does not treat a literal example inside %s as an executable plan",
    (opening) => {
      const closing = opening.replace("text", "");
      expectInvalid([opening, block(proposal()), closing].join("\n"));
    },
  );

  it("permits surrounding snippets and ignores nested examples beside one actual protocol block", () => {
    const plan = [
      "````markdown",
      block(proposal([entry("README.md")])),
      "````",
      "~~~typescript",
      'const source = "src/other.ts";',
      "~~~",
      block(proposal()),
      "```text",
      "Другой пример после плана.",
      "```",
    ].join("\n");
    expect(derive(plan).affectedPaths).toEqual([
      "src/components/Header/index.tsx",
    ]);
  });

  it("accepts 100 exact files but enforces the block limit in UTF-8 bytes", () => {
    const small = block(
      proposal(
        Array.from({ length: 100 }, (_, i) => entry(`src/file-${i}.ts`)),
      ),
    );
    expect(derive(small).affectedPaths).toHaveLength(100);
    const large = block(
      proposal(
        Array.from({ length: 100 }, (_, i) =>
          entry(`src/file-${i}.ts`, "я".repeat(2000)),
        ),
      ),
    );
    expect(large.length).toBeLessThan(256 * 1024);
    expect(new TextEncoder().encode(large).length).toBeGreaterThan(256 * 1024);
    expectInvalid(large);
  });
});

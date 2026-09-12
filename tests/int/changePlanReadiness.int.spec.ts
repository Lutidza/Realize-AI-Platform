/**
 * @file tests/int/changePlanReadiness.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет общую готовность code plan, серверные отказы и безопасную DTO-проекцию.
 */

import { createHash } from "node:crypto";
import {
  assessChangePlanReadiness,
  ChangePlanError,
  deriveChangePlan,
} from "@realize/change-engine";
import { describe, expect, it } from "vitest";
import { toMessageDTO } from "../../packages/payload-ai-plugin/src/endpoints/mappers";
import { redactText } from "../../packages/payload-ai-plugin/src/endpoints/redaction";

const codePlan =
  "Обновить src/components/Header/index.tsx, проверить навигацию и npm run typecheck.";
const dataProposal = [
  codePlan,
  "```realize-data-operation",
  JSON.stringify({
    kind: "pages.createDraft.v1",
    version: "1.0",
    title: "О нас",
    slug: "about",
    sections: [{ body: "Мы помогаем выбирать товары для дома." }],
  }),
  "```",
].join("\n");

describe("shared code plan readiness", () => {
  it.each([
    {
      name: "exact code plan",
      content: codePlan,
      expected: { status: "ready" },
    },
    {
      name: "trimmed exact plan",
      content: `  \n${codePlan}\n  `,
      expected: { status: "ready" },
    },
    {
      name: "text-only page revision",
      content:
        "Вот обновлённый текст страницы: мы помогаем выбирать товары для дома и заботимся о каждом заказе.",
      expected: { status: "needs_clarification", reason: "missing_paths" },
    },
    {
      name: "short answer with a path",
      content: "Изменить src/a.ts",
      expected: { status: "needs_clarification", reason: "too_short" },
    },
    {
      name: "empty answer",
      content: "  \n ",
      expected: { status: "needs_clarification", reason: "too_short" },
    },
    {
      name: "valid Data Lane proposal with code references",
      content: dataProposal,
      expected: { status: "unavailable", reason: "data_operation" },
    },
    {
      name: "damaged Data Lane block before length check",
      content: "```realize-data-operation\n{",
      expected: { status: "unavailable", reason: "data_operation" },
    },
    {
      name: "absolute paths and traversal",
      content:
        "Изменить /tmp/workspace/src/app/page.tsx и src/../../outside.ts, затем проверить результат.",
      expected: { status: "needs_clarification", reason: "missing_paths" },
    },
  ])("matches the create-plan guard for $name", ({ content, expected }) => {
    expect(assessChangePlanReadiness(content)).toEqual(expected);
    const derive = () =>
      deriveChangePlan({ originalRequest: "Изменить страницу", plan: content });
    if (expected.status === "ready") {
      expect(derive().affectedPaths).toEqual([
        "src/components/Header/index.tsx",
      ]);
    } else {
      expect(derive).toThrow(ChangePlanError);
    }
  });

  it("preserves the ready plan classification, checks and trimmed text hash", () => {
    const derived = deriveChangePlan({
      originalRequest: "  Исправь   навигацию ",
      plan: ` \n${codePlan}  `,
    });
    expect(derived).toMatchObject({
      normalizedIntent: "Исправь навигацию",
      title: "Исправь навигацию",
      type: "CODE_CHANGE",
      riskLevel: "R3",
      planHash: createHash("sha256").update(codePlan).digest("hex"),
    });
    expect(derived.checks).toContain("npm run typecheck");
    expect(derived.scopeHash).toBe(
      createHash("sha256")
        .update(
          JSON.stringify({
            affectedPaths: derived.affectedPaths,
            checks: derived.checks,
          }),
        )
        .digest("hex"),
    );
  });
});

describe("message change-plan projection", () => {
  it.each(["user", "system"])(
    "never offers a code plan for a %s message containing paths",
    (role) => {
      expect(
        toMessageDTO({ id: 1, content: codePlan, role }).changePlan,
      ).toEqual({
        status: "unavailable",
        reason: "not_assistant",
      });
    },
  );

  it("uses the original Data Lane block before removing it for display", () => {
    const dto = toMessageDTO({
      id: 1,
      content: dataProposal,
      role: "assistant",
    });
    expect(dto.dataOperationIntentAvailable).toBe(true);
    expect(dto.content).toBe(codePlan);
    expect(dto.changePlan).toEqual({
      status: "unavailable",
      reason: "data_operation",
    });
    expect(assessChangePlanReadiness(dto.content)).toEqual({ status: "ready" });
  });

  it("does not turn an invalid Data Lane block into a code-plan action", () => {
    const dto = toMessageDTO({
      id: 1,
      content: `${codePlan}\n\`\`\`realize-data-operation\n{broken}\n\`\`\``,
      role: "assistant",
    });
    expect(dto.dataOperationIntentAvailable).toBe(false);
    expect(dto.changePlan).toEqual({
      status: "unavailable",
      reason: "data_operation",
    });
  });

  it("runs the same redaction as the create-plan endpoint before checking length", () => {
    const content = `sk-${"a".repeat(45)}`;
    expect(assessChangePlanReadiness(content)).toEqual({
      status: "needs_clarification",
      reason: "missing_paths",
    });
    const readiness = toMessageDTO({
      id: 1,
      content,
      role: "assistant",
    }).changePlan;
    expect(readiness).toEqual({
      status: "needs_clarification",
      reason: "too_short",
    });
    expect(readiness).toEqual(assessChangePlanReadiness(redactText(content)));
    expect(() =>
      deriveChangePlan({
        originalRequest: "Уточни",
        plan: redactText(content),
      }),
    ).toThrow("План слишком короткий");
  });

  it("projects only readiness status without raw records or internal scope fields", () => {
    const dto = toMessageDTO({
      id: 1,
      content: codePlan,
      conversation: { id: 2, token: "private-conversation-field" },
      requestedBy: { id: 3, email: "private-user@example.invalid" },
      role: "assistant",
      internalMetadata: "private-metadata",
      changePlan: { status: "unavailable", reason: "data_operation" },
    });
    expect(dto.changePlan).toEqual({ status: "ready" });
    expect(dto.conversationID).toBe("2");
    expect(dto).not.toHaveProperty("requestedBy");
    expect(dto).not.toHaveProperty("internalMetadata");
    expect(JSON.stringify(dto)).not.toContain("private-");
    expect(dto.changePlan).not.toHaveProperty("affectedPaths");
  });
});

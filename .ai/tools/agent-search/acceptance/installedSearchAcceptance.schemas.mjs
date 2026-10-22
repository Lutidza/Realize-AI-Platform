/**
 * @file .ai/tools/agent-search/acceptance/installedSearchAcceptance.schemas.mjs
 * @version 1.1.0
 * @date 2026-10-22
 * @description Ограничивает operator evidence установленной версии; отметка ChatGPT требует реального conversation URL.
 * @see documentation/architecture/repository-search.md
 */
import { z } from "zod";

export const INSTALLED_SEARCH_CHECKS = Object.freeze([
  "admin-direct",
  "admin-subagent",
  "execution",
  "review",
  "cli",
  "mcp",
  "chatgpt",
]);
const sourceUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value, "http://localhost");
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === "/api/realize-ai/chat/project-file" &&
        /^[a-f0-9]{64}$/.test(url.searchParams.get("expectedSha256") ?? "") &&
        /^[1-9]\d{0,6}$/.test(url.searchParams.get("startLine") ?? "")
      );
    } catch {
      return false;
    }
  });
const check = z.strictObject({
  consumer: z.enum(INSTALLED_SEARCH_CHECKS),
  confirmedAt: z.iso.datetime(),
  evidenceKind: z.literal("operator-confirmed"),
  eventIDs: z.array(z.uuid()).min(1).max(16),
  runID: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .optional(),
  sourceUrl: sourceUrl.optional(),
  conversationURL: z
    .string()
    .max(256)
    .regex(
      /^https:\/\/chatgpt\.com\/(?:g\/g-[A-Za-z0-9-]{1,128}\/)?c\/[A-Za-z0-9-]{8,128}$/,
    )
    .refine((value) => !/\s/u.test(value))
    .optional(),
});
export const installedSearchAcceptanceSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  installedBuildID: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  checks: z.array(check).min(1).max(7),
});

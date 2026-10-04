/**
 * @file packages/ai-contracts/src/parseCodexModels.validator.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проецирует bounded страницу model/list без raw provider metadata.
 * @see documentation/architecture/codex-integration.md
 */
import { z } from "zod";
import type { CodexModelDTO } from "./CodexModelCatalog.types";

const page = z.object({
  data: z
    .array(
      z.object({
        model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/),
        displayName: z.string().min(1).max(256),
        description: z.string().max(4000),
        isDefault: z.boolean(),
        hidden: z.boolean(),
        multiAgentVersion: z
          .enum(["disabled", "v1", "v2"])
          .nullable()
          .optional(),
      }),
    )
    .max(100),
  nextCursor: z.string().min(1).max(2048).nullable().optional(),
});

/** Неизвестные поля отбрасываются; цены и доступ не выводятся из названия модели. */
export function parseCodexModelPage(value: unknown): {
  models: CodexModelDTO[];
  nextCursor: string | null;
} {
  const parsed = page.parse(value);
  return {
    models: parsed.data
      .filter((model) => !model.hidden)
      .map((model) => ({
        model: model.model,
        displayName: model.displayName,
        description: model.description,
        isDefault: model.isDefault,
        multiAgentVersion: model.multiAgentVersion ?? null,
      })),
    nextCursor: parsed.nextCursor ?? null,
  };
}

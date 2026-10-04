/**
 * @file packages/ai-contracts/src/searchQuality.schemas.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Ограничивает контрольные замеры качества и длительности задач, отдельно от completion rate.
 * @see documentation/architecture/repository-search.md
 */
import { z } from "zod";
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const searchQualityRunSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    id: z.uuid(),
    observedAt: z.iso.datetime(),
    corpus: z.enum(["repository-navigation", "import-resolution"]),
    corpusVersion: hash,
    sourceVersion: hash,
    release: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9._-]+$/),
    consumer: z.enum(["cli", "mcp"]),
    mode: z.enum(["literal-baseline", "navigation", "imports"]),
    cache: z.enum(["initial", "repeat"]),
    repeat: count.max(4),
    targets: count.min(1).max(256),
    correctTargets: count.max(256),
    taskDurationMs: z.number().finite().min(0).max(86400000),
    calls: count.max(4096),
    filesRead: count.nullable(),
    bytesRead: count.nullable(),
    outputBytes: count,
  })
  .refine(
    (run) =>
      run.correctTargets <= run.targets &&
      (run.cache === "initial" ? run.repeat === 0 : run.repeat > 0),
  );
export const searchQualityImportSchema = z.strictObject({
  runs: z.array(searchQualityRunSchema).min(1).max(20),
});

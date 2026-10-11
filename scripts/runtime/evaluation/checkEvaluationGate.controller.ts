/**
 * @file scripts/runtime/evaluation/checkEvaluationGate.controller.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Блокирует release без актуального поведенческого baseline и качественного review.
 */
import { parseArgs } from "node:util";
import { readReleaseSourceJSON } from "../../release/readReleaseSourceFiles.adapter";
import { z } from "zod";
import { checkEvaluationGate } from "./checkEvaluationGate.service";

try {
  const { values } = parseArgs({
    options: { report: { type: "string" }, review: { type: "string" } },
  });
  const pointer =
    values.report && values.review
      ? { report: values.report, review: values.review }
      : z
          .strictObject({ report: z.string(), review: z.string() })
          .parse(
            await readReleaseSourceJSON(
              process.cwd(),
              ".github/quality-evidence/current.json",
            ),
          );
  if (Boolean(values.report) !== Boolean(values.review))
    throw new Error("EVAL_BOTH_PATHS_REQUIRED");
  console.log(
    JSON.stringify(
      await checkEvaluationGate(process.cwd(), pointer.report, pointer.review),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof Error && /^EVAL_[A-Z_:a-zA-Z]+$/.test(error.message)
      ? error.message
      : "EVAL_EVIDENCE_UNAVAILABLE_OR_INVALID",
  );
  process.exitCode = 1;
}

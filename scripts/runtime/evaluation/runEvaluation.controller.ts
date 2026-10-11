/**
 * @file scripts/runtime/evaluation/runEvaluation.controller.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Запускает явный owner eval без автоматических provider retries и утечки credentials.
 */
import nextEnv from "@next/env";
import { parseArgs } from "node:util";
import { runEvaluationSuite } from "./runEvaluationSuite.service";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const abort = new AbortController();
const stop = () => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const { values } = parseArgs({
    options: {
      output: { type: "string" },
      "allow-unknown-subscription-cost": { type: "boolean", default: false },
      preflight: { type: "boolean", default: false },
    },
  });
  if (!values.output) throw new Error("EVAL_OUTPUT_REQUIRED");
  const result = await runEvaluationSuite({
    root: process.cwd(),
    output: values.output,
    environment: process.env,
    allowUnknownSubscriptionCost: values["allow-unknown-subscription-cost"],
    preflight: values.preflight,
    signal: abort.signal,
  });
  console.log(JSON.stringify(result, null, 2));
  if (
    "assessment" in result &&
    result.assessment &&
    !["passed", "review_required"].includes(result.assessment.status)
  )
    process.exitCode = 1;
} catch (error) {
  // Только собственные bounded codes; raw provider/SQL errors не попадают в stdout.
  console.error(
    error instanceof Error && /^EVAL_[A-Z_]+$/.test(error.message)
      ? error.message
      : "EVAL_RUNTIME_UNAVAILABLE",
  );
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}

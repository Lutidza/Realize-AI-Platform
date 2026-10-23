/**
 * @file .ai/tools/git-delivery/src/verification/runGitVerification.controller.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Запускает выбранные проверки либо читает актуальность их квитанций из личного плана.
 * @docref ADR-0016
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
import { PolicyError } from "@realize/git-runtime";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadGitContext } from "../loadGitContext.adapter.ts";
import {
  runVerification,
  validateVerificationPlan,
  verifyVerification,
} from "@realize/verification-runtime";
import { gitVerificationOptions } from "../worker/verification/gitVerificationOptions.config.ts";

const abort = new AbortController();
const cancel = () => abort.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);

try {
  const [action, flag, planPath, ...extra] = process.argv.slice(2);
  if (
    !["run", "status"].includes(action) ||
    flag !== "--plan" ||
    !planPath ||
    extra.length
  ) {
    throw new PolicyError(
      "verification_command_invalid",
      "Использование: npm run git:verify -- run|status --plan /absolute/plan.json",
    );
  }
  const plan = validateVerificationPlan(await loadGitContext(planPath));
  const root = await realpath(
    fileURLToPath(new URL("../../../../../", import.meta.url)),
  );
  if ((await realpath(plan.repositoryRoot)) !== root) {
    throw new PolicyError(
      "verification_root_mismatch",
      "План относится к другой рабочей копии.",
    );
  }
  const execute = action === "run" ? runVerification : verifyVerification;
  const report = await execute(
    plan,
    gitVerificationOptions(plan, abort.signal),
  );
  process.stdout.write(JSON.stringify(report) + "\n");
  process.exitCode = report.success ? 0 : 1;
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      version: 1,
      success: false,
      errorCode:
        error instanceof PolicyError
          ? error.code
          : "verification_configuration_invalid",
    }) + "\n",
  );
  process.exitCode = 2;
} finally {
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
}

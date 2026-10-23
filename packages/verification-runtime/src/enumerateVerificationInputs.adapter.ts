/**
 * @file packages/verification-runtime/src/enumerateVerificationInputs.adapter.ts
 * @version 1.1.0
 * @date 2026-10-22
 * @description Раскрывает состав исходников проверок с обязательными входами вызывающего адаптера.
 */
import { PolicyError } from "@realize/git-runtime";
import { readVerificationInputSnapshot } from "./hashVerificationInputs.adapter.ts";
import { VERIFICATION_AUTOMATIC_INPUTS } from "./verificationInputs.constants.ts";
import { validateVerificationPlan } from "./validateVerificationPlan.validator.ts";
import type { VerificationOptions } from "./Verification.types.ts";

export async function enumerateVerificationInputs(
  input: unknown,
  options: VerificationOptions,
): Promise<string[]> {
  const plan = validateVerificationPlan(input);
  const { paths } = await readVerificationInputSnapshot(plan.repositoryRoot, [
    ...VERIFICATION_AUTOMATIC_INPUTS,
    ...(options.additionalInputs ?? []),
  ]);
  for (const check of plan.checks)
    paths.push(
      ...(
        await readVerificationInputSnapshot(
          plan.repositoryRoot,
          check.inputs,
          check.excludeInputs,
        )
      ).paths,
    );
  if (paths.length > 50000)
    throw new PolicyError(
      "verification_fingerprint_limit",
      "Inputs превышают предел перечня исходников.",
    );
  return [...new Set(paths)].sort();
}

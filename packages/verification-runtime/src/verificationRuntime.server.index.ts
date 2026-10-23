/**
 * @file packages/verification-runtime/src/verificationRuntime.server.index.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Предоставляет общий серверный контракт проверок и защищённого локального evidence.
 */
export { runVerification } from "./runVerification.service.ts";
export { verifyVerification } from "./verifyVerification.service.ts";
export { validateVerificationPlan } from "./validateVerificationPlan.validator.ts";
export { enumerateVerificationInputs } from "./enumerateVerificationInputs.adapter.ts";
export { hashVerificationRecipe } from "./hashVerificationRecipe.util.ts";
export { materializeVerificationDependencies } from "./materializeVerificationDependencies.adapter.ts";
export { PrivateJsonRepository } from "./PrivateJson.repository.ts";
export type { PrivateJsonLocation } from "./PrivateJson.types.ts";
export type {
  VerificationCheck,
  VerificationPlan,
  VerificationReport,
  VerificationResult,
  VerificationStatus,
  VerificationOptions,
  VerificationProcessResult,
  VerificationDependencyLease,
} from "./Verification.types.ts";

/**
 * @file packages/verification-runtime/src/verificationMeasurement.util.ts
 * @version 1.0.0
 * @date 2026-11-05
 * @description Измеряет локальные wall-clock фазы verification runtime без влияния diagnostics sink на результат.
 */
import { performance } from "node:perf_hooks";
import type {
  VerificationMeasurement,
  VerificationOptions,
} from "./Verification.types.ts";

type MeasurementDetails = Omit<
  VerificationMeasurement,
  "phase" | "durationMs" | "boundary" | "outcome"
>;
type MeasurementResultDetails = Partial<MeasurementDetails> & {
  outcome?: VerificationMeasurement["outcome"];
};

/** Завершает один inclusive span; ошибки потребителя diagnostics не меняют выполнение проверки. */
export function startVerificationMeasurement(
  options: VerificationOptions | undefined,
  phase: string,
): (
  outcome: VerificationMeasurement["outcome"],
  details?: MeasurementDetails,
) => void {
  const observer = options?.onMeasurement;
  if (!observer) return () => undefined;
  const startedAt = performance.now();
  let completed = false;
  return (outcome, details = {}) => {
    if (completed) return;
    completed = true;
    try {
      observer({
        phase,
        durationMs: performance.now() - startedAt,
        boundary: "inclusive",
        outcome,
        ...details,
      });
    } catch {
      // Diagnostics являются наблюдателем и не должны менять outcome verification.
    }
  };
}

/** Замеряет sync owner boundary и повторно выбрасывает исходную ошибку. */
export function measureVerificationMeasurementSync<T>(
  options: VerificationOptions | undefined,
  phase: string,
  operation: () => T,
): T {
  if (!options?.onMeasurement) return operation();
  const finish = startVerificationMeasurement(options, phase);
  try {
    const result = operation();
    finish("success");
    return result;
  } catch (error) {
    finish("error");
    throw error;
  }
}

/** Замеряет async owner boundary, включая ожидание I/O, и сохраняет исходный outcome. */
export async function measureVerificationMeasurement<T>(
  options: VerificationOptions | undefined,
  phase: string,
  operation: () => Promise<T>,
  details?: (result: T) => MeasurementResultDetails,
): Promise<T> {
  if (!options?.onMeasurement) return operation();
  const finish = startVerificationMeasurement(options, phase);
  try {
    const result = await operation();
    const resultDetails = details?.(result);
    const { outcome = "success", ...metadata } = resultDetails ?? {};
    finish(outcome, metadata);
    return result;
  } catch (error) {
    finish("error");
    throw error;
  }
}

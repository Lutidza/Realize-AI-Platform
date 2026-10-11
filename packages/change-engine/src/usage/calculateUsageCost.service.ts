/**
 * @file packages/change-engine/src/usage/calculateUsageCost.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Рассчитывает стоимость точными integer nanos без двойного учёта cached input.
 */
import type { UsageCost, UsagePrice, UsageTokens } from "@realize/ai-contracts";

export const unknownUsageCost = (): UsageCost => ({
  state: "unknown",
  amountNanos: null,
  currency: null,
  pricingId: null,
  evidenceRef: null,
});

/** Округление вверх выполняется один раз до наносуммы; разные валюты здесь не смешиваются. */
export function calculateUsageCost(
  price: UsagePrice | undefined,
  tokens: UsageTokens,
  durationMs: number | null,
): UsageCost {
  if (!price) return unknownUsageCost();
  let numerator: bigint;
  let denominator: bigint;
  if (price.unit === "second") {
    if (durationMs === null || price.rates.secondNanos === null)
      return unknownUsageCost();
    numerator = BigInt(durationMs) * BigInt(price.rates.secondNanos);
    denominator = BigInt(1000);
  } else {
    const { inputTokens, cachedInputTokens, outputTokens } = tokens;
    const { inputNanos, cachedInputNanos, outputNanos } = price.rates;
    if (
      inputTokens === null ||
      cachedInputTokens === null ||
      outputTokens === null ||
      inputNanos === null ||
      cachedInputNanos === null ||
      outputNanos === null
    )
      return unknownUsageCost();
    numerator =
      BigInt(inputTokens - cachedInputTokens) * BigInt(inputNanos) +
      BigInt(cachedInputTokens) * BigInt(cachedInputNanos) +
      BigInt(outputTokens) * BigInt(outputNanos);
    denominator = BigInt(1000000);
  }
  return {
    state: "estimated",
    amountNanos: (
      (numerator + denominator - BigInt(1)) /
      denominator
    ).toString(),
    currency: price.currency,
    pricingId: price.pricingId,
    evidenceRef: price.sourceRef,
  };
}

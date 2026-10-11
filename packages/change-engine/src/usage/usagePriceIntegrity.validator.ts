/**
 * @file packages/change-engine/src/usage/usagePriceIntegrity.validator.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет неизменяемый тариф и отделяет подписку провайдера от API-тарифа.
 */
import { usagePriceSchema, type UsagePrice } from "@realize/ai-contracts";
import { hashCanonicalJSON } from "../canonicalJson";

export function parseUsagePrice(value: unknown): UsagePrice {
  const price = usagePriceSchema.parse(value);
  const { contentHash, ...body } = price;
  if (hashCanonicalJSON(body) !== contentHash)
    throw new Error("USAGE_PRICE_HASH_MISMATCH");
  if (
    price.basis === "provider" &&
    ["chatgpt", "chatgpt-account", "oauth"].includes(price.authMode) &&
    price.method !== "subscription_allocation"
  )
    throw new Error("USAGE_SUBSCRIPTION_REQUIRES_ALLOCATION");
  return price;
}

export function createUsagePrice(
  input: Omit<UsagePrice, "contentHash">,
): UsagePrice {
  return parseUsagePrice({ ...input, contentHash: hashCanonicalJSON(input) });
}

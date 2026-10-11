/**
 * @file packages/payload-ai-plugin/src/usage/UsagePricing.repository.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Публикует immutable тарифы и выбирает снимок по модели, способу оплаты и времени попытки.
 */
import { parseUsagePrice } from "@realize/change-engine";
import type {
  UsageAttemptInput,
  UsagePrice,
  UsageCostBasis,
} from "@realize/ai-contracts";
import type {
  UsageDatabase,
  UsagePriceCommand,
  UsageTransaction,
} from "./UsageStore.types";
import { withUsageTransaction } from "./withUsageTransaction.adapter";
import { appendUsageEvent } from "./usageLedgerEvent.repository";

export class UsagePricingRepository {
  constructor(private readonly database: UsageDatabase) {}

  async publish({
    price: value,
    actorId,
  }: UsagePriceCommand): Promise<UsagePrice> {
    const price = parseUsagePrice(value);
    if (Date.parse(price.observedAt) > Date.now() + 300000)
      throw new Error("USAGE_PRICE_FUTURE_OBSERVATION");
    return withUsageTransaction(this.database, async (client) => {
      const existing = await client.query<{ snapshot: UsagePrice }>(
        "SELECT snapshot FROM realize_ai_usage_prices WHERE pricing_id=$1",
        [price.pricingId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].snapshot.contentHash !== price.contentHash)
          throw new Error("USAGE_PRICE_IMMUTABLE");
        return parseUsagePrice(existing.rows[0].snapshot);
      }
      const previous = await client.query<{ revision: number }>(
        "SELECT (snapshot->>'revision')::int AS revision FROM realize_ai_usage_prices WHERE installation_id=$1 AND basis=$2 AND provider=$3 AND model=$4 AND auth_mode=$5 ORDER BY (snapshot->>'revision')::int DESC LIMIT 1",
        [
          price.installationId,
          price.basis,
          price.provider,
          price.model,
          price.authMode,
        ],
      );
      if (price.revision !== (previous.rows[0]?.revision ?? 0) + 1)
        throw new Error("USAGE_PRICE_REVISION_CONFLICT");
      await appendUsageEvent(
        client,
        `price:${price.pricingId}`,
        price.pricingId,
        "price_published",
        { price, actorId },
      );
      await client.query(
        "INSERT INTO realize_ai_usage_prices(pricing_id,installation_id,basis,provider,model,auth_mode,effective_from,snapshot,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),now())",
        [
          price.pricingId,
          price.installationId,
          price.basis,
          price.provider,
          price.model,
          price.authMode,
          price.effectiveFrom,
          JSON.stringify(price),
        ],
      );
      return price;
    });
  }
}

/** Новая публикация не меняет уже сохранённый prices snapshot попытки. */
export async function readUsagePrices(
  client: UsageTransaction,
  input: UsageAttemptInput,
): Promise<Partial<Record<UsageCostBasis, UsagePrice>>> {
  const result = await client.query<{ snapshot: UsagePrice }>(
    `SELECT DISTINCT ON (basis) snapshot FROM realize_ai_usage_prices
     WHERE installation_id=$1 AND effective_from<=$2 AND
       ((basis IN ('provider','customer') AND provider=$3 AND model=$4 AND auth_mode=$5)
       OR (basis='infrastructure' AND provider='platform' AND model=$6 AND auth_mode='internal'))
     ORDER BY basis,effective_from DESC,id DESC`,
    [
      input.context.installationId,
      input.startedAt,
      input.provider,
      input.requestedModel,
      input.authMode,
      input.context.source,
    ],
  );
  return Object.fromEntries(
    result.rows.map(({ snapshot }) => {
      const price = parseUsagePrice(snapshot);
      return [price.basis, price];
    }),
  );
}

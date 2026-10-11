/**
 * @file packages/payload-ai-plugin/src/usage/readVerifiedUsageCosts.repository.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Считает полную измеренную стоимость подтверждённой задачи по всем её попыткам, включая ошибки.
 */
import type { UsageDashboardDto, UsageQuery } from "@realize/ai-contracts";
import type { UsageTransaction } from "./UsageStore.types";

export async function readVerifiedUsageCosts(
  client: UsageTransaction,
  query: UsageQuery,
  from: string,
  to: string,
  platform: boolean,
): Promise<UsageDashboardDto["verifiedTasks"]> {
  const cte = `WITH verified AS (
    SELECT event->>'installationId' AS installation_id,event->>'projectId' AS project_id,event->>'taskId' AS task_id,max(event->>'verifiedAt') AS verified_at
    FROM realize_ai_usage_events WHERE kind='task_verified' AND event->>'definition'='verified_preview'
      AND event->>'verifiedAt'>=$1 AND event->>'verifiedAt'<=$2
      AND ($3::text IS NULL OR event->>'installationId'=$3) AND ($4::text IS NULL OR event->>'projectId'=$4)
      AND ($5::text IS NULL OR event->>'purpose'=$5)
    GROUP BY event->>'installationId',event->>'projectId',event->>'taskId'
  ), per_task AS (
    SELECT v.installation_id,v.project_id,v.task_id,b.basis,
      min(a.record->'costs'->b.basis->>'currency') AS currency,
      sum((a.record->'costs'->b.basis->>'amountNanos')::numeric) AS amount,
      count(DISTINCT a.record->'costs'->b.basis->>'currency')=1 AND count(a.id)>0 AND
        bool_and(COALESCE(a.record->'costs'->b.basis->>'amountNanos' IS NOT NULL
          AND a.record->>'outcome'<>'running' AND (a.record->>'coverage'='turn' OR a.record->'costs'->b.basis->>'state'='reconciled'),false)) AS complete
    FROM verified v CROSS JOIN unnest($6::text[]) b(basis)
      LEFT JOIN realize_ai_usage_attempts a ON a.installation_id=v.installation_id AND a.project_id=v.project_id AND a.task_id=v.task_id AND a.purpose='customer_runtime' AND a.started_at <= v.verified_at::timestamptz
        AND (b.basis='infrastructure' OR a.record->>'provider'<>'platform')
    GROUP BY v.installation_id,v.project_id,v.task_id,b.basis
  )`;
  const values = [
    from,
    to,
    query.installationId ?? null,
    query.projectId ?? null,
    query.purpose ?? null,
    platform ? ["provider", "infrastructure", "customer"] : ["customer"],
  ];
  const totals = await client.query<{ successful: number }>(
    `${cte} SELECT count(*)::int AS successful FROM verified`,
    values,
  );
  const missing = await client.query<{ basis: string; count: number }>(
    `${cte} SELECT basis,count(*) FILTER(WHERE NOT complete)::int AS count FROM per_task GROUP BY basis`,
    values,
  );
  const amounts = await client.query<
    UsageDashboardDto["verifiedTasks"]["amounts"][number]
  >(
    `${cte} SELECT basis,currency,count(*)::int AS "pricedTasks",sum(amount)::text AS "amountNanos",ceil(sum(amount)/count(*))::text AS "averageNanos" FROM per_task WHERE complete GROUP BY basis,currency ORDER BY basis,currency LIMIT 2201`,
    values,
  );
  if (amounts.rows.length > 2200) throw new Error("USAGE_QUERY_TOO_WIDE");
  return {
    definition: "verified_preview",
    successfulTasks: totals.rows[0].successful,
    unknownByBasis: Object.fromEntries(
      missing.rows.map((row) => [row.basis, row.count]),
    ),
    amounts: amounts.rows,
  };
}

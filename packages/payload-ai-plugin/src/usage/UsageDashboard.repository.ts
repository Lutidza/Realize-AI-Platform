/**
 * @file packages/payload-ai-plugin/src/usage/UsageDashboard.repository.ts
 * @version 1.2.0
 * @date 2026-10-06
 * @description Строит bounded агрегаты и страницы расходов в согласованном PostgreSQL snapshot.
 */
import type {
  UsageAmountDto,
  UsageDashboardDto,
  PlatformUsageDashboardDto,
  UsageQuery,
  UsageGroupDto,
  UsageBudgetPolicy,
  UsagePrice,
} from "@realize/ai-contracts";
import type {
  UsageDatabase,
  UsageAccessScope,
  UsageAttemptRow,
} from "./UsageStore.types";
import { withUsageTransaction } from "./withUsageTransaction.adapter";
import {
  usageAttemptDto,
  platformUsageAttemptDto,
} from "./usageAttemptDto.mapper";
import { readUsageBudget } from "./UsageBudgets.repository";
import { scopeUsageQuery } from "./usageScope.validator";
import { readUsageIdentity } from "./readUsageIdentity.config";
import { readVerifiedUsageCosts } from "./readVerifiedUsageCosts.repository";
import { parseUsagePrice } from "@realize/change-engine";
import { readUsageAnalytics } from "./readUsageAnalytics.repository";
import type { UsageAmountSegment } from "./UsageAnalytics.types";
import { usageGroupExpressions } from "./usageGroupExpressions.config";
import { readUsageFilterOptions } from "./readUsageFilterOptions.repository";

export class UsageDashboardRepository {
  constructor(private readonly database: UsageDatabase) {}

  async read(
    scope: UsageAccessScope,
    requested: UsageQuery,
  ): Promise<UsageDashboardDto | PlatformUsageDashboardDto> {
    const query = scopeUsageQuery(scope, requested);
    const now = new Date();
    const from = new Date(now.getTime() - query.days * 86400000).toISOString();
    const values: unknown[] = [from, now.toISOString()];
    const filters = ["started_at >= $1", "started_at < $2"];
    const filter = (column: string, value: string | undefined) => {
      if (value !== undefined) {
        values.push(value);
        filters.push(`${column}=$${values.length}`);
      }
    };
    filter("installation_id", query.installationId);
    filter("project_id", query.projectId);
    filter("purpose", query.purpose);
    // Facets сохраняют account ACL, но не исчезают при выборе конкретной группы.
    const optionsWhere = filters.join(" AND ");
    const optionsValues = [...values];
    filter("source", query.source);
    for (const key of [
      "systemReleaseId",
      "overlayReleaseId",
      "modelCatalogRevision",
      "routerPolicyVersion",
    ] as const)
      filter(`record->'context'->>'${key}'`, query[key]);
    filter(`(${usageGroupExpressions.models})`, query.model);
    filter("record->>'outcome'", query.outcome);
    filter(usageGroupExpressions.workflows, query.workflowKey);
    filter(usageGroupExpressions.agents, query.agentProfileKey);
    const where = filters.join(" AND ");
    const bases =
      scope.view === "platform"
        ? ["provider", "infrastructure", "customer"]
        : ["customer"];
    return withUsageTransaction(
      this.database,
      async (client) => {
        const summary = await client.query<UsageDashboardDto["summary"]>(
          `SELECT count(*)::int AS attempts,count(DISTINCT (installation_id,project_id,purpose,task_id))::int AS tasks,
        count(*) FILTER(WHERE record->>'outcome'='completed')::int AS completed,count(*) FILTER(WHERE record->>'outcome'='failed')::int AS failed,
        count(*) FILTER(WHERE record->>'outcome'='cancelled')::int AS cancelled,count(*) FILTER(WHERE record->>'outcome'='running')::int AS running,
        count(*) FILTER(WHERE (record->'context'->>'attemptNumber')::int>1)::int AS retries,
        count(*) FILTER(WHERE record->>'coverage'<>'turn')::int AS partial,
        count(*) FILTER(WHERE ${scope.view === "platform" ? "record->'costs'->(CASE WHEN record->>'provider'='platform' THEN 'infrastructure' ELSE 'provider' END)->>'state'='unknown'" : "record->>'provider'<>'platform' AND record->'costs'->'customer'->>'state'='unknown'"})::int AS unpriced,
        sum((record->'tokens'->>'inputTokens')::numeric)::text AS "inputTokens",sum((record->'tokens'->>'cachedInputTokens')::numeric)::text AS "cachedInputTokens",
        sum((record->'tokens'->>'outputTokens')::numeric)::text AS "outputTokens",
        count(*) FILTER(WHERE record->'tokens'->>'inputTokens' IS NULL OR record->'tokens'->>'outputTokens' IS NULL)::int AS "unknownTokenAttempts",
        sum((record->>'durationMs')::numeric)::text AS "durationMs" FROM realize_ai_usage_attempts WHERE ${where}`,
          values,
        );
        const money = async (
          group: string | null,
          periodValues = values,
          segment: UsageAmountSegment = "all",
        ) => {
          const segmentFilter =
            segment === "retry"
              ? " AND record->>'provider'<>'platform' AND (record->'context'->>'attemptNumber')::int>1"
              : segment === "unsuccessful"
                ? " AND record->>'provider'<>'platform' AND record->>'outcome' IN ('failed','cancelled')"
                : "";
          const result = await client.query<UsageAmountDto & { key: string }>(
            `SELECT ${group ? `${group} AS key,` : ""} b.basis,record->'costs'->b.basis->>'currency' AS currency,
        sum((record->'costs'->b.basis->>'amountNanos')::numeric)::text AS "amountNanos",
        count(*) FILTER(WHERE record->'costs'->b.basis->>'state'='estimated')::int AS estimated,
        count(*) FILTER(WHERE record->'costs'->b.basis->>'state'='reconciled')::int AS reconciled
        FROM realize_ai_usage_attempts CROSS JOIN unnest(ARRAY[${bases.map((b) => `'${b}'`).join(",")}]) AS b(basis)
        WHERE ${where}${segmentFilter} AND record->'costs'->b.basis->>'amountNanos' IS NOT NULL
        GROUP BY ${group ? `${group},` : ""} b.basis,record->'costs'->b.basis->>'currency' ORDER BY ${group ? "key," : ""} b.basis,currency LIMIT 2201`,
            periodValues,
          );
          if (result.rows.length > 2200)
            throw new Error("USAGE_QUERY_TOO_WIDE");
          return result;
        };
        const groups = async (expression: string): Promise<UsageGroupDto[]> => {
          const counts = await client.query<Omit<UsageGroupDto, "amounts">>(
            `SELECT ${expression} AS key,count(*)::int AS attempts,
          count(*) FILTER(WHERE record->>'provider'<>'platform')::int AS "modelAttempts",
          count(*) FILTER(WHERE record->>'outcome'='failed')::int AS failed,count(*) FILTER(WHERE record->>'coverage'<>'turn')::int AS partial,
          count(*) FILTER(WHERE record->>'provider'<>'platform' AND (record->'tokens'->>'inputTokens' IS NULL OR record->'tokens'->>'outputTokens' IS NULL))::int AS "unknownTokenAttempts",
          sum((record->'tokens'->>'inputTokens')::numeric)::text AS "inputTokens",sum((record->'tokens'->>'outputTokens')::numeric)::text AS "outputTokens"
          FROM realize_ai_usage_attempts WHERE ${where} GROUP BY ${expression} ORDER BY key LIMIT 368`,
            values,
          );
          if (counts.rows.length > 367) throw new Error("USAGE_QUERY_TOO_WIDE");
          const amounts = await money(expression);
          return counts.rows.map((row) => ({
            ...row,
            amounts: amounts.rows
              .filter((a) => a.key === row.key)
              .map(({ key: _key, ...amount }) => amount),
          }));
        };
        const rows = await client.query<UsageAttemptRow>(
          `SELECT id,record FROM realize_ai_usage_attempts WHERE ${where}${query.before ? ` AND id<$${values.length + 1}` : ""} ORDER BY id DESC LIMIT 26`,
          query.before ? [...values, query.before] : values,
        );
        const policies = await client.query<{ policy: UsageBudgetPolicy }>(
          `SELECT policy FROM realize_ai_usage_budgets WHERE ($1::text IS NULL OR installation_id=$1) AND ($2::text IS NULL OR project_id=$2) AND ($3::text IS NULL OR purpose=$3) ${scope.view === "installation" ? "AND basis='customer'" : ""} ORDER BY account_key LIMIT 101`,
          [
            query.installationId ?? null,
            query.projectId ?? null,
            query.purpose ?? null,
          ],
        );
        if (policies.rows.length > 100) throw new Error("USAGE_QUERY_TOO_WIDE");
        const budgets = [];
        for (const { policy } of policies.rows)
          budgets.push(
            await readUsageBudget(
              client,
              policy,
              now.toISOString().slice(0, 7),
            ),
          );
        const identity = readUsageIdentity();
        const common: UsageDashboardDto = {
          view: scope.view,
          installationId: identity.installationId,
          projectId: identity.projectId,
          generatedAt: now.toISOString(),
          from,
          days: query.days,
          analytics: await readUsageAnalytics({
            client,
            where,
            values,
            from,
            to: now.toISOString(),
            readAmounts: async (periodValues, segment) =>
              (await money(null, periodValues, segment)).rows,
          }),
          summary: summary.rows[0],
          verifiedTasks: await readVerifiedUsageCosts(
            client,
            query,
            from,
            now.toISOString(),
            scope.view === "platform",
          ),
          amounts: (await money(null)).rows,
          byDay: await groups(
            "to_char(started_at AT TIME ZONE 'UTC','YYYY-MM-DD')",
          ),
          byModel: await groups(usageGroupExpressions.models),
          byWorkflow: await groups(usageGroupExpressions.workflows),
          byAgent: await groups(usageGroupExpressions.agents),
          bySource: await groups("source"),
          byPurpose: await groups("purpose"),
          filterOptions: await readUsageFilterOptions(
            client,
            optionsWhere,
            optionsValues,
          ),
          items: rows.rows
            .slice(0, 25)
            .map((row) => usageAttemptDto(row.record)),
          nextCursor: rows.rows.length > 25 ? String(rows.rows[24].id) : null,
          budgets,
          coverage: {
            externalDevelopment: "not_connected",
            providerRetries: "not_exposed",
            childThreads: "partial",
            infrastructure: "model_checks_preview_start",
          },
        };
        if (scope.view === "installation") return common;
        const prices = await client.query<{ snapshot: UsagePrice }>(
          "SELECT snapshot FROM realize_ai_usage_prices WHERE ($1::text IS NULL OR installation_id=$1) AND ($2::text IS NULL OR model=$2) ORDER BY id DESC LIMIT 50",
          [query.installationId ?? null, query.model ?? null],
        );
        return {
          ...common,
          view: "platform",
          items: rows.rows
            .slice(0, 25)
            .map((row) => platformUsageAttemptDto(row.record)),
          prices: prices.rows.map((row) => parseUsagePrice(row.snapshot)),
        };
      },
      true,
    );
  }
}

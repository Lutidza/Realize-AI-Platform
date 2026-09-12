/**
 * @file packages/payload-ai-plugin/src/endpoints/workflowRunRegistry.sql.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Строит параметризованные запросы owned workflow chain без нового хранилища и JSON индексов.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type {
  WorkflowRunListQuery,
  WorkflowRunOptionsQuery,
} from "@realize/ai-contracts";

/**
 * Потомок читается через существующий UNIQUE idempotency_key; 65-й сегмент обнаруживает нарушение max64.
 * Ограниченный LATERAL lookup сохраняет адресный план и не сканирует JSON остальных владельцев.
 */
const chain = (singleRoot: boolean) => `WITH RECURSIVE roots AS (
  SELECT r.id AS root_id, r.conversation_id, r.created_at AS root_created_at,
    jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status) AS conversation
  FROM realize_ai_runs r
  JOIN realize_ai_conversations c ON c.id = r.conversation_id
  WHERE r.requested_by_id = $1 AND c.created_by_id = $1
    AND r.idempotency_key NOT LIKE 'workflow:child:%'
    AND jsonb_typeof(r.turn_context -> 'workflow') = 'object'
    AND r.turn_context #>> '{workflow,parentRunID}' IS NULL
    AND COALESCE(r.turn_context #>> '{workflow,rootRunID}', r.id::text) = r.id::text
    ${singleRoot ? "AND r.id = $2" : ""}
), chain AS (
  SELECT root_id AS id, root_id, conversation_id, root_created_at, conversation, 1 AS segment_count
  FROM roots
  UNION ALL
  SELECT child.id, chain.root_id, chain.conversation_id, chain.root_created_at,
    chain.conversation, chain.segment_count + 1
  FROM chain
  JOIN LATERAL (
    SELECT child.* FROM realize_ai_runs child
    WHERE child.idempotency_key = 'workflow:child:' || chain.id::text LIMIT 1
  ) child ON TRUE
  WHERE chain.segment_count < 65
    AND child.requested_by_id = $1 AND child.conversation_id = chain.conversation_id
    AND child.turn_context #>> '{workflow,parentRunID}' = chain.id::text
    AND child.turn_context #>> '{workflow,rootRunID}' = chain.root_id::text
)`;

const runDocument = `jsonb_build_object(
  'id', r.id, 'conversation', r.conversation_id, 'requestedBy', r.requested_by_id,
  'createdAt', r.created_at, 'updatedAt', r.updated_at, 'startedAt', r.started_at,
  'finishedAt', r.finished_at, 'status', r.status, 'turnContext', r.turn_context,
  'model', r.model, 'threadID', r.thread_i_d, 'usage', r.usage, 'errorSummary', r.error_summary,
  'idempotencyKey', r.idempotency_key, 'requestHash', r.request_hash)`;

/**
 * Поиск читает только метаданные. Тела входов, результатов и инструкций не участвуют в сопоставлении.
 * У корня ровно один leaf благодаря unique child key; разница счётчиков обнаруживает оборванную связь до пагинации.
 */
const leaves = (includeTitles: boolean) => `${chain(false)}, leaves AS (
  SELECT chain.*, r.updated_at,
    r.turn_context #>> '{workflow,workflowKey}' AS workflow_key,
    r.turn_context #>> '{agentConfiguration,compiled,profile,key}' AS profile_key,
    ${includeTitles ? "r.turn_context #>> '{agentConfiguration,compiled,profile,title}'" : "NULL::text"} AS profile_title,
    ${
      includeTitles
        ? `(SELECT artifact #>> '{artifact,title}'
      FROM jsonb_array_elements(r.turn_context #> '{agentConfiguration,compiled,selectedArtifacts}') artifact
      WHERE artifact #>> '{artifact,kind}' = 'workflow_definition'
        AND artifact #>> '{artifact,key}' = r.turn_context #>> '{workflow,workflowKey}' LIMIT 1)`
        : "NULL::text"
    } AS workflow_title,
    CASE WHEN r.status IN ('failed', 'cancelled', 'queued', 'running') THEN r.status::text
      ELSE r.turn_context #>> '{workflow,phase}' END AS registry_status
  FROM chain JOIN LATERAL (
    SELECT r.* FROM realize_ai_runs r WHERE r.id = chain.id LIMIT 1
  ) r ON TRUE
  WHERE chain.segment_count = 65 OR NOT EXISTS (
    SELECT 1 FROM realize_ai_runs child
    WHERE child.idempotency_key = 'workflow:child:' || chain.id::text
  )
), integrity AS (
  SELECT EXISTS (SELECT 1 FROM chain WHERE segment_count = 65)
    OR (SELECT COUNT(*) FROM roots) <> (SELECT COUNT(*) FROM leaves) AS invalid
)`;

export const buildWorkflowRunListQuery = (
  userID: number | string,
  input: WorkflowRunListQuery,
) => {
  const values: unknown[] = [userID];
  const conditions: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (input.workflowKey)
    conditions.push(`workflow_key = ${parameter(input.workflowKey)}`);
  if (input.profileKey)
    conditions.push(`profile_key = ${parameter(input.profileKey)}`);
  if (input.status)
    conditions.push(`registry_status = ${parameter(input.status)}`);
  if (input.createdFrom)
    conditions.push(
      `root_created_at >= ${parameter(input.createdFrom)}::timestamptz`,
    );
  if (input.createdTo)
    conditions.push(
      `root_created_at < ${parameter(input.createdTo)}::timestamptz`,
    );
  if (input.query)
    conditions.push(`strpos(lower(concat_ws(' ', root_id::text, workflow_key, workflow_title,
    profile_key, profile_title, conversation ->> 'title')), lower(${parameter(input.query)})) > 0`);
  const limit = parameter(input.pageSize);
  const offset = parameter((input.page - 1) * input.pageSize);
  return {
    values,
    text: `${leaves(Boolean(input.query))}, filtered AS (
      SELECT * FROM leaves ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ), page AS (
      SELECT * FROM filtered ORDER BY updated_at DESC, root_id DESC LIMIT ${limit} OFFSET ${offset}
    )
    SELECT (SELECT invalid FROM integrity) AS "integrityError",
      (SELECT COUNT(*)::integer FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'rootRunID', page.root_id::text, 'rootCreatedAt', page.root_created_at,
        'conversation', page.conversation, 'segmentCount', page.segment_count, 'latestRun', ${runDocument}
      ) ORDER BY page.updated_at DESC, page.root_id DESC)
      FROM page JOIN realize_ai_runs r ON r.id = page.id), '[]'::jsonb) AS items`,
  };
};

export const buildWorkflowRunOptionsQuery = (
  userID: number | string,
  input: WorkflowRunOptionsQuery,
) => {
  const values: unknown[] = [
    userID,
    input.query || "",
    input.pageSize,
    (input.page - 1) * input.pageSize,
  ];
  const key = input.kind === "workflow" ? "workflow_key" : "profile_key";
  const title = input.kind === "workflow" ? "workflow_title" : "profile_title";
  return {
    values,
    text: `${leaves(true)}, historical AS (
      SELECT DISTINCT ON (${key}) ${key} AS key, COALESCE(${title}, ${key}) AS title
      FROM leaves WHERE ${key} IS NOT NULL
      ORDER BY ${key}, updated_at DESC, root_id DESC
    ), filtered AS (
      SELECT * FROM historical WHERE $2 = '' OR strpos(lower(concat_ws(' ', key, title)), lower($2)) > 0
    ), page AS (
      SELECT * FROM filtered ORDER BY title, key LIMIT $3 OFFSET $4
    ) SELECT (SELECT invalid FROM integrity) AS "integrityError",
      (SELECT COUNT(*)::integer FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('key', key, 'title', title) ORDER BY title, key)
        FROM page), '[]'::jsonb) AS items`,
  };
};

export const buildWorkflowRunChainQuery = (
  userID: number | string,
  rootRunID: number,
) => ({
  values: [userID, rootRunID],
  text: `${chain(true)} SELECT chain.conversation, ${runDocument} AS run,
    EXISTS(SELECT 1 FROM realize_ai_runs child
      WHERE child.idempotency_key = 'workflow:child:' || chain.id::text) AS "hasChild"
    FROM chain JOIN realize_ai_runs r ON r.id = chain.id ORDER BY chain.segment_count`,
});

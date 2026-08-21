/**
 * @file scripts/migrations/schema-evidence.mjs
 * @version 2026-08-17
 * @description Captures and compares semantic PostgreSQL schema evidence.
 */

import { createHash } from "node:crypto";

const schemaQueries = Object.freeze({
  columns: `
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      attribute.attname AS column_name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
      attribute.attnotnull AS not_null,
      COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, false), '') AS default_expression,
      attribute.attidentity::text AS identity_kind,
      attribute.attgenerated::text AS generated_kind,
      attribute.attstorage::text AS storage_kind,
      attribute.attcompression::text AS compression_kind,
      COALESCE(collation_namespace.nspname, '') AS collation_schema,
      COALESCE(collation_value.collname, '') AS collation_name
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
      AND default_value.adnum = attribute.attnum
    LEFT JOIN pg_catalog.pg_collation AS collation_value
      ON collation_value.oid = attribute.attcollation
    LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
      ON collation_namespace.oid = collation_value.collnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY relation.relname, attribute.attname
  `,
  constraints: `
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      constraint_value.conname AS constraint_name,
      constraint_value.contype::text AS constraint_type,
      constraint_value.condeferrable AS deferrable,
      constraint_value.condeferred AS initially_deferred,
      constraint_value.convalidated AS validated,
      pg_catalog.pg_get_constraintdef(constraint_value.oid, false) AS definition
    FROM pg_catalog.pg_constraint AS constraint_value
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = constraint_value.conrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
    ORDER BY relation.relname, constraint_value.conname
  `,
  enums: `
    SELECT
      namespace.nspname AS schema_name,
      type_value.typname AS type_name,
      json_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder) AS labels
    FROM pg_catalog.pg_type AS type_value
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = type_value.typnamespace
    JOIN pg_catalog.pg_enum AS enum_value
      ON enum_value.enumtypid = type_value.oid
    WHERE namespace.nspname = 'public'
    GROUP BY namespace.nspname, type_value.typname
    ORDER BY type_value.typname
  `,
  extensions: `
    SELECT
      extension_value.extname AS extension_name,
      extension_value.extversion AS extension_version,
      namespace.nspname AS schema_name,
      extension_value.extrelocatable AS relocatable
    FROM pg_catalog.pg_extension AS extension_value
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = extension_value.extnamespace
    ORDER BY extension_value.extname
  `,
  functions: `
    SELECT
      namespace.nspname AS schema_name,
      procedure_value.proname AS function_name,
      pg_catalog.pg_get_function_identity_arguments(procedure_value.oid) AS identity_arguments,
      procedure_value.prokind::text AS function_kind,
      language.lanname AS language_name,
      pg_catalog.pg_get_functiondef(procedure_value.oid) AS definition
    FROM pg_catalog.pg_proc AS procedure_value
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure_value.pronamespace
    JOIN pg_catalog.pg_language AS language
      ON language.oid = procedure_value.prolang
    LEFT JOIN pg_catalog.pg_depend AS extension_dependency
      ON extension_dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND extension_dependency.objid = procedure_value.oid
      AND extension_dependency.deptype = 'e'
    WHERE namespace.nspname = 'public'
      AND extension_dependency.objid IS NULL
    ORDER BY procedure_value.proname, identity_arguments
  `,
  indexes: `
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      index_relation.relname AS index_name,
      index_value.indisprimary AS primary_index,
      index_value.indisunique AS unique_index,
      index_value.indisexclusion AS exclusion_index,
      index_value.indisclustered AS clustered,
      index_value.indisvalid AS valid,
      index_value.indisready AS ready,
      pg_catalog.pg_get_indexdef(index_value.indexrelid, 0, false) AS definition
    FROM pg_catalog.pg_index AS index_value
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = index_value.indrelid
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_value.indexrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
    ORDER BY relation.relname, index_relation.relname
  `,
  policies: `
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      policy.polname AS policy_name,
      policy.polpermissive AS permissive,
      policy.polcmd::text AS command,
      ARRAY(
        SELECT role_value.rolname
        FROM pg_catalog.pg_roles AS role_value
        WHERE role_value.oid = ANY(policy.polroles)
        ORDER BY role_value.rolname
      ) AS roles,
      COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false), '') AS using_expression,
      COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false), '') AS check_expression
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
    ORDER BY relation.relname, policy.polname
  `,
  sequences: `
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS sequence_name,
      pg_catalog.format_type(sequence_value.seqtypid, NULL) AS data_type,
      sequence_value.seqstart::text AS start_value,
      sequence_value.seqincrement::text AS increment_by,
      sequence_value.seqmax::text AS maximum_value,
      sequence_value.seqmin::text AS minimum_value,
      sequence_value.seqcache::text AS cache_size,
      sequence_value.seqcycle AS cycle
    FROM pg_catalog.pg_sequence AS sequence_value
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = sequence_value.seqrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
    ORDER BY relation.relname
  `,
  tables: `
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      relation.relkind::text AS relation_kind,
      relation.relpersistence::text AS persistence,
      relation.relrowsecurity AS row_security,
      relation.relforcerowsecurity AS force_row_security,
      COALESCE(access_method.amname, '') AS access_method,
      COALESCE(pg_catalog.pg_get_partkeydef(relation.oid), '') AS partition_key
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = relation.relam
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
    ORDER BY relation.relname
  `,
  triggers: `
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      trigger_value.tgname AS trigger_name,
      trigger_value.tgenabled::text AS enabled,
      pg_catalog.pg_get_triggerdef(trigger_value.oid, false) AS definition
    FROM pg_catalog.pg_trigger AS trigger_value
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = trigger_value.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND NOT trigger_value.tgisinternal
    ORDER BY relation.relname, trigger_value.tgname
  `,
  types: `
    SELECT
      namespace.nspname AS schema_name,
      type_value.typname AS type_name,
      type_value.typtype::text AS type_kind,
      pg_catalog.format_type(type_value.typbasetype, type_value.typtypmod) AS base_type,
      type_value.typnotnull AS not_null,
      COALESCE(type_value.typdefault, '') AS default_value
    FROM pg_catalog.pg_type AS type_value
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = type_value.typnamespace
    LEFT JOIN pg_catalog.pg_depend AS extension_dependency
      ON extension_dependency.classid = 'pg_catalog.pg_type'::pg_catalog.regclass
      AND extension_dependency.objid = type_value.oid
      AND extension_dependency.deptype = 'e'
    WHERE namespace.nspname = 'public'
      AND type_value.typtype IN ('d', 'r', 'm')
      AND extension_dependency.objid IS NULL
    ORDER BY type_value.typname
  `,
  views: `
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS view_name,
      relation.relkind::text AS view_kind,
      pg_catalog.pg_get_viewdef(relation.oid, false) AS definition
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('v', 'm')
    ORDER BY relation.relname
  `,
});

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, child]) => [key, stableObject(child)]),
    );
  }

  return value;
}

function stableJson(value) {
  return JSON.stringify(stableObject(value));
}

/**
 * Captures schema-only PostgreSQL catalog facts while intentionally ignoring
 * physical column order and all table data.
 *
 * @param {{ query: (query: string) => Promise<{ rows: object[] }> }} client
 * @returns {Promise<Record<string, object[]>>} Semantic public-schema snapshot.
 */
export async function captureSchemaSnapshot(client) {
  const entries = [];

  for (const [category, query] of Object.entries(schemaQueries)) {
    try {
      const result = await client.query(query);
      entries.push([category, result.rows]);
    } catch (error) {
      throw new Error(
        `Could not capture schema category ${category}: ${error.message}`,
        { cause: error },
      );
    }
  }

  return Object.fromEntries(entries);
}

/**
 * Produces a deterministic representation of catalog facts for comparison.
 * Enum label arrays retain their order because enum order is schema semantics.
 *
 * @param {Record<string, object[]>} snapshot
 * @returns {Record<string, object[]>} Canonical snapshot.
 */
export function canonicalizeSchemaSnapshot(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot)
      .sort(([leftCategory], [rightCategory]) =>
        leftCategory.localeCompare(rightCategory),
      )
      .map(([category, rows]) => [
        category,
        rows
          .map((row) => stableObject(row))
          .sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          ),
      ]),
  );
}

/**
 * Compares two semantic schema snapshots and returns bounded diagnostic data.
 *
 * @param {Record<string, object[]>} leftSnapshot
 * @param {Record<string, object[]>} rightSnapshot
 * @returns {{ equal: boolean, leftHash: string, rightHash: string, counts: Record<string, { left: number, right: number }>, differences: object[] }}
 */
export function compareSchemaSnapshots(leftSnapshot, rightSnapshot) {
  const left = canonicalizeSchemaSnapshot(leftSnapshot);
  const right = canonicalizeSchemaSnapshot(rightSnapshot);
  const leftJson = stableJson(left);
  const rightJson = stableJson(right);
  const categories = Array.from(
    new Set([...Object.keys(left), ...Object.keys(right)]),
  ).sort();
  const counts = {};
  const differences = [];

  for (const category of categories) {
    const leftRows = left[category] ?? [];
    const rightRows = right[category] ?? [];
    counts[category] = { left: leftRows.length, right: rightRows.length };

    const leftSet = new Set(leftRows.map(stableJson));
    const rightSet = new Set(rightRows.map(stableJson));
    const leftOnly = [...leftSet]
      .filter((row) => !rightSet.has(row))
      .slice(0, 5)
      .map(JSON.parse);
    const rightOnly = [...rightSet]
      .filter((row) => !leftSet.has(row))
      .slice(0, 5)
      .map(JSON.parse);

    if (leftOnly.length > 0 || rightOnly.length > 0) {
      differences.push({ category, leftOnly, rightOnly });
    }
  }

  return {
    equal: leftJson === rightJson,
    leftHash: createHash("sha256").update(leftJson).digest("hex"),
    rightHash: createHash("sha256").update(rightJson).digest("hex"),
    counts,
    differences,
  };
}

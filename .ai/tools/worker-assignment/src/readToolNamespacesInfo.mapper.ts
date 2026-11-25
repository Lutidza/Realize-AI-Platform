/**
 * @file .ai/tools/worker-assignment/src/readToolNamespacesInfo.mapper.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Извлекает маршруты ToolRouter из метаданных тела запроса Responses Lite.
 */
import { z } from "zod";

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const tool = z.strictObject({
  name: identifier,
  direct: z.boolean(),
  deferred: z.boolean(),
  code_mode_name: z
    .string()
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,199}$/)
    .nullable(),
  source: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("harness") }),
    z.strictObject({ kind: z.literal("mcp"), server_name: identifier }),
  ]),
});
const namespaces = z.record(
  identifier,
  z.strictObject({
    name: identifier,
    functions: z.record(identifier, tool),
  }),
);
const carrier = z.object({
  client_metadata: z
    .object({ "x-codex-turn-metadata": z.string().optional() })
    .optional(),
});

/** HTTP-заголовок совместимости исключает инвентарь. Читаем JSON-строку только из client_metadata тела. */
export function readToolNamespacesInfo(body: unknown) {
  const envelope = carrier.safeParse(body);
  if (!envelope.success) return { reason: "metadata_invalid" } as const;
  const encoded = envelope.data.client_metadata?.["x-codex-turn-metadata"];
  if (encoded === undefined) return { reason: "metadata_missing" } as const;
  let metadata: unknown;
  try {
    metadata = JSON.parse(encoded);
  } catch {
    return { reason: "metadata_invalid" } as const;
  }
  const field = z
    .object({ tool_namespaces_info: z.unknown().optional() })
    .safeParse(metadata);
  if (!field.success) return { reason: "metadata_invalid" } as const;
  if (field.data.tool_namespaces_info === undefined)
    return { reason: "metadata_missing" } as const;
  const parsed = namespaces.safeParse(field.data.tool_namespaces_info);
  if (!parsed.success) return { reason: "metadata_invalid" } as const;

  const routes = [];
  const codeNames = new Set<string>();
  for (const [namespace, group] of Object.entries(parsed.data)) {
    if (group.name !== namespace)
      return { reason: "metadata_invalid" } as const;
    for (const [name, entry] of Object.entries(group.functions)) {
      const nested = entry.code_mode_name;
      if (
        name !== entry.name ||
        (!entry.direct && !entry.deferred && nested === null)
      ) {
        return { reason: "metadata_invalid" } as const;
      }
      if (nested !== null) {
        if (codeNames.has(nested))
          return { reason: "metadata_invalid" } as const;
        codeNames.add(nested);
      }
      routes.push({ ...entry, name: namespace + "." + name });
    }
  }
  return { reason: null, routes } as const;
}

/**
 * @file services/ai-control-plane/src/pageDiscoveryTools.adapter.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Передаёт только зарегистрированные инструменты чтения серверу, владеющему Payload и правами запуска.
 */
import {
  parsePageDiscoveryCall,
  parsePageDiscoveryGrant,
  parsePageDiscoveryResult,
  type AgentReadTools,
} from "@realize/ai-contracts";
import { PAGE_DISCOVERY_TOOLS } from "@realize/change-engine";
import type { ControlPlaneRun } from "./runStore";

const MAX_RESPONSE_BYTES = 128 * 1024;

/** Ограничивает поток до JSON parsing, включая ошибочные HTTP-ответы. */
const readResponse = async (response: Response): Promise<unknown> => {
  if (!response.body) throw new Error("page_tool_response_missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new Error("page_tool_response_too_large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};

/** Credentials остаются в замыкании транспорта, никогда не являются tool arguments/results. */
export const createPageDiscoveryReadTools = (
  run: ControlPlaneRun,
  signal?: AbortSignal,
): AgentReadTools | undefined => {
  if (!run.pageDiscovery) return undefined;
  if (run.workflow) throw new Error("page_tools_workflow_forbidden");
  const grant = parsePageDiscoveryGrant(run.pageDiscovery, run.id);
  return {
    definitions: PAGE_DISCOVERY_TOOLS,
    execute: async (input) => {
      const call = parsePageDiscoveryCall(input);
      if (run.cancelRequested || signal?.aborted)
        throw new Error("page_tool_cancelled");
      try {
        const timeout = AbortSignal.timeout(15_000);
        const response = await fetch(grant.endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${grant.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(call),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        const value = await readResponse(response);
        if (run.cancelRequested || signal?.aborted)
          throw new Error("page_tool_cancelled");
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("page_tool_response_invalid");
        const envelope = value as Record<string, unknown>;
        if (!response.ok || envelope.ok !== true) {
          // Не передаём сообщения upstream: они могут включать внутренние детали или URL.
          const message =
            response.status === 409
              ? "Page context or call is stale or conflicting. Read the page again with a new call before proposing changes."
              : response.status === 429
                ? "Page tool budget for this run is exhausted. Ask the user to narrow the request in a new message."
                : response.status === 401 || response.status === 403
                  ? "Page access is currently unavailable for this administrator or run."
                  : response.status === 404
                    ? "The page is missing or unavailable. Search again; never invent a page."
                    : "The page service could not complete this read. Do not claim a result.";
          return { ok: false, error: { message } };
        }
        return parsePageDiscoveryResult(call.name, envelope.data);
      } catch {
        // Даже fetch/JSON/schema errors не должны раскрывать endpoint или Bearer token.
        throw new Error("page_tool_service_unavailable");
      }
    },
  };
};

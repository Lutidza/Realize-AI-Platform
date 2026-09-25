/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/readMcpPage.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Предоставляет Pages read facade с текущим actor, ACL и ограниченным ожиданием БД.
 */
import type { Payload } from "payload";
import {
  parseIdentifier,
  parsePageDraftContext,
  parsePageStructureContext,
} from "@realize/ai-contracts";
import { mcpToolInputs } from "../../../../ai-contracts/src/mcpToolInputs.config";
import { EndpointError } from "../../endpoints/http";
import { PageDraftUpdate } from "../../endpoints/pageDraftUpdate.service";
import { withPayloadTransaction } from "../../endpoints/payloadTransaction";
import { listPageDrafts } from "../../chat-context/listPageDrafts.repository";
import { readMcpActor } from "./readMcpActor.service";
import { withMcpReadCancellation } from "./withMcpReadCancellation.adapter";

/** Provider readiness не участвует в чтении; действующие permission callbacks и update ACL сохраняются. */
export async function readMcpPage(
  payload: Payload,
  userID: string,
  name: "pages_list" | "pages_get" | "pages_get_structure",
  input: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  signal.throwIfAborted();
  const req = await readMcpActor(payload, userID);
  return withPayloadTransaction(req, async () => {
    const transactionID = await req.transactionID;
    const adapter = payload.db as unknown as {
      name: string;
      sessions?: Record<
        string,
        { db?: { execute: (sql: string) => Promise<unknown> } }
      >;
    };
    const transaction =
      transactionID == null
        ? undefined
        : adapter.sessions?.[String(transactionID)]?.db;
    if (adapter.name !== "postgres" || !transaction)
      throw new EndpointError(
        "INTEGRATION_UNAVAILABLE",
        "Для Pages требуется транзакция PostgreSQL.",
        503,
      );
    // PostgreSQL сам прекращает ожидание lock/query; внешний timeout не оставляет запрос в фоне.
    await transaction.execute(
      "SET LOCAL lock_timeout = '3000ms'; SET LOCAL statement_timeout = '8000ms'; SET LOCAL idle_in_transaction_session_timeout = '10000ms'",
    );
    signal.throwIfAborted();
    return withMcpReadCancellation(req, signal, async () => {
      let result;
      if (name === "pages_list") {
        const value = mcpToolInputs.pages_list.parse(input);
        result = await listPageDrafts(req, value.query, value.page);
      } else if (name === "pages_get") {
        const value = mcpToolInputs.pages_get.parse(input);
        result = parsePageDraftContext(
          await new PageDraftUpdate(payload, req).readContext(
            parseIdentifier(value.pageID, "page id"),
          ),
        );
      } else {
        const { pageID, ...request } =
          mcpToolInputs.pages_get_structure.parse(input);
        result = parsePageStructureContext(
          await new PageDraftUpdate(payload, req).readStructure(
            parseIdentifier(pageID, "page id"),
            request,
          ),
        );
      }
      signal.throwIfAborted();
      return result;
    });
  });
}

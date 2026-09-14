/**
 * @file packages/payload-ai-plugin/src/chat-context/PageDiscovery.repository.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Сериализует закрытый журнал вызовов и снимков страницы внутри одного запуска.
 */
import { createHash } from "node:crypto";
import type { CollectionSlug, Payload, PayloadRequest } from "payload";
import { RUNS_SLUG } from "../constants";
import { EndpointError } from "../endpoints/http";
import { withPayloadTransaction } from "../endpoints/payloadTransaction";
import { AIRepository, type AIDocument } from "../endpoints/repository";
import { relationID } from "../endpoints/mappers";
import type { ChatRunContext } from "./ChatRunContext.types";

/** Bootstrap читает только идентичность; дальнейшие запросы Pages получают actor request. */
export const readPageDiscoveryActor = async (
  payload: Payload,
  runID: string,
  userID: string,
  userCollection: string,
): Promise<NonNullable<PayloadRequest["user"]>> => {
  const run = await payload.findByID({
    collection: RUNS_SLUG as CollectionSlug,
    id: runID,
    depth: 0,
    overrideAccess: true,
    select: { requestedBy: true },
  });
  if (relationID((run as unknown as AIDocument).requestedBy) !== userID)
    throw new EndpointError(
      "FORBIDDEN",
      "Запуск не принадлежит владельцу допуска.",
      403,
    );
  // Текущие роли перечитываются; документ пользователя остаётся только на сервере.
  const user = await payload.findByID({
    collection: userCollection as CollectionSlug,
    id: userID,
    depth: 0,
    overrideAccess: true,
  });
  return { ...user, collection: userCollection } as NonNullable<
    PayloadRequest["user"]
  >;
};

export class PageDiscoveryRepository {
  private readonly runs: AIRepository;
  constructor(
    private readonly req: PayloadRequest,
    private readonly runID: string,
    private readonly userID: string,
  ) {
    this.runs = new AIRepository(req.payload, req);
  }

  /** Владение и terminal guard проверяются также на повторах сохранённых вызовов. */
  async current(): Promise<{ run: AIDocument; context: ChatRunContext }> {
    const run = await this.runs.getRun(this.runID, this.userID);
    const context = run.turnContext as ChatRunContext | undefined;
    if (
      relationID(run.requestedBy) !== this.userID ||
      !context?.pageDiscoveryEnabled ||
      context.workflow
    )
      throw new EndpointError(
        "FORBIDDEN",
        "Инструменты страниц не разрешены для этого запуска.",
        403,
      );
    if (!["queued", "running"].includes(String(run.status)))
      throw new EndpointError(
        "CONFLICT",
        "Запуск уже завершён. Отправьте новый запрос.",
        409,
      );
    const conversation = await this.runs.requireOwnedConversation(
      relationID(run.conversation),
      this.userID,
    );
    if (conversation.status !== "active")
      throw new EndpointError(
        "CONFLICT",
        "Диалог доступен только для чтения.",
        409,
      );
    return { run, context };
  }

  /** Ключ lock вычислен из server-owned namespace и hash; ввод не подставляется в SQL. */
  async locked<T>(work: (context: ChatRunContext) => Promise<T>): Promise<T> {
    return withPayloadTransaction(this.req, async () => {
      const transactionID = await this.req.transactionID;
      const adapter = this.req.payload.db as unknown as {
        name?: string;
        sessions?: Record<
          string,
          { db?: { execute?: (query: string) => Promise<unknown> } }
        >;
      };
      const transaction =
        transactionID == null
          ? undefined
          : adapter.sessions?.[String(transactionID)]?.db;
      if (
        adapter.name !== "postgres" ||
        typeof transaction?.execute !== "function"
      )
        throw new Error("Page discovery requires a PostgreSQL transaction.");
      const key = createHash("sha256")
        .update(`realize:page-discovery:${this.runID}`)
        .digest();
      await transaction.execute(
        `SELECT pg_advisory_xact_lock(${key.readInt32BE(0)}, ${key.readInt32BE(4)})`,
      );
      return work((await this.current()).context);
    });
  }

  async save(context: ChatRunContext): Promise<void> {
    await this.runs.updateRun(this.runID, { turnContext: context });
  }
}

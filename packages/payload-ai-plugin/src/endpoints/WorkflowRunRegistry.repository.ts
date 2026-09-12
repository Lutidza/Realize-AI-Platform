/**
 * @file packages/payload-ai-plugin/src/endpoints/WorkflowRunRegistry.repository.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Читает owned корни, актуальные сегменты и полную ограниченную историю через Payload PostgreSQL pool.
 */

import type {
  WorkflowRunListQuery,
  WorkflowRunOptionsDTO,
  WorkflowRunOptionsQuery,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import type { Pool } from "pg";
import type { AIDocument } from "./repository";
import type { WorkflowRegistryRow } from "./WorkflowRunProjection.types";
import { EndpointError } from "./http";
import {
  buildWorkflowRunChainQuery,
  buildWorkflowRunListQuery,
  buildWorkflowRunOptionsQuery,
} from "./workflowRunRegistry.sql";

const invalidChain = (): never => {
  throw new EndpointError(
    "CONFLICT",
    "История процесса содержит повреждённую или слишком длинную цепочку сегментов.",
    409,
  );
};

/** Узкий read adapter использует штатный pool; Local API find не выражает recursive leaf pagination. */
export class WorkflowRunRegistryRepository {
  private readonly database: Pick<Pool, "query">;

  constructor(req: PayloadRequest) {
    const database = req.payload.db as unknown as {
      pool?: Pick<Pool, "query">;
    };
    if (!database.pool)
      throw new EndpointError(
        "INTERNAL_ERROR",
        "Хранилище истории процессов недоступно.",
        503,
      );
    this.database = database.pool;
  }

  async list(
    userID: number | string,
    query: WorkflowRunListQuery,
  ): Promise<{ items: WorkflowRegistryRow[]; total: number }> {
    const result = await this.database.query<{
      items: WorkflowRegistryRow[];
      total: number;
      integrityError: boolean;
    }>(buildWorkflowRunListQuery(userID, query));
    const page = result.rows[0] || {
      items: [],
      total: 0,
      integrityError: false,
    };
    if (
      page.integrityError ||
      page.items.some((item) => item.segmentCount > 64)
    )
      return invalidChain();
    return { items: page.items, total: page.total };
  }

  async options(
    userID: number | string,
    query: WorkflowRunOptionsQuery,
  ): Promise<WorkflowRunOptionsDTO> {
    const result = await this.database.query<{
      items: WorkflowRunOptionsDTO["items"];
      total: number;
      integrityError: boolean;
    }>(buildWorkflowRunOptionsQuery(userID, query));
    const page = result.rows[0] || {
      items: [],
      total: 0,
      integrityError: false,
    };
    if (page.integrityError) return invalidChain();
    return {
      items: page.items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems: page.total,
      totalPages: Math.ceil(page.total / query.pageSize),
    };
  }

  async getOwnedChain(
    rootRunID: string,
    userID: number | string,
  ): Promise<{ conversation: AIDocument; runs: AIDocument[] }> {
    // Канонический AIRun использует serial ID; некорректный ввод не должен превращаться в ошибку PostgreSQL.
    if (!/^[1-9]\d{0,9}$/.test(rootRunID) || Number(rootRunID) > 2_147_483_647)
      throw new EndpointError("NOT_FOUND", "Процесс не найден.", 404);
    const result = await this.database.query<{
      conversation: AIDocument;
      run: AIDocument;
      hasChild: boolean;
    }>(buildWorkflowRunChainQuery(userID, Number(rootRunID)));
    const first = result.rows[0];
    if (!first) throw new EndpointError("NOT_FOUND", "Процесс не найден.", 404);
    if (result.rows.length > 64 || result.rows.at(-1)?.hasChild)
      return invalidChain();
    return {
      conversation: first.conversation,
      runs: result.rows.map((row) => row.run),
    };
  }
}

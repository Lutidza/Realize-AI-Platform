/**
 * @file packages/payload-ai-plugin/src/design-workshop/DesignPreview.repository.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Выполняет scoped queue queries и атомарную отмену без обхода fencing.
 * @see documentation/specifications/design-workshop.md
 */
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { PayloadRequest, RequiredDataFromCollectionSlug } from "payload";
import { EndpointError } from "../endpoints/http";
import { DESIGN_PREVIEW_JOBS_SLUG as collection } from "./designWorkshop.constants";
import type { DesignPreviewRecord } from "./DesignPreview.types";

export class DesignPreviewRepository {
  constructor(private readonly req: PayloadRequest) {}
  async job(
    projectId: string,
    jobId: string,
    includeImages = false,
  ): Promise<DesignPreviewRecord> {
    const result = await this.req.payload.find({
      collection,
      where: {
        and: [
          { projectId: { equals: projectId } },
          { jobId: { equals: jobId } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: this.req,
      ...(!includeImages ? { select: { images: false } } : {}),
    });
    if (!result.docs[0])
      throw new EndpointError(
        "NOT_FOUND",
        "Задание предпросмотра не найдено.",
        404,
      );
    return result.docs[0];
  }
  async replay(requestKey: string) {
    const result = await this.req.payload.find({
      collection,
      where: { requestKey: { equals: requestKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: this.req,
      select: { images: false },
    });
    return result.docs[0];
  }
  create(data: RequiredDataFromCollectionSlug<typeof collection>) {
    return this.req.payload.create({
      collection,
      data,
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
  }
  async counts(projectId: string) {
    const all = await this.req.payload.count({
      collection,
      where: { projectId: { equals: projectId } },
      overrideAccess: true,
      req: this.req,
    });
    const active = await this.req.payload.count({
      collection,
      where: {
        and: [
          { projectId: { equals: projectId } },
          { state: { in: ["queued", "running"] } },
          { expiresAt: { greater_than: new Date().toISOString() } },
        ],
      },
      overrideAccess: true,
      req: this.req,
    });
    return { all: all.totalDocs, active: active.totalDocs };
  }
  async list(projectId: string) {
    return (
      await this.req.payload.find({
        collection,
        where: { projectId: { equals: projectId } },
        sort: "-createdAt",
        limit: 10,
        depth: 0,
        overrideAccess: true,
        req: this.req,
        select: { images: false },
      })
    ).docs;
  }
  async available(): Promise<boolean> {
    const db = this.req.payload.db as unknown as PostgresAdapter;
    const result = await db.pool.query(
      "SELECT 1 FROM realize_ai_worker_presence WHERE state IN ('idle','busy') AND last_seen_at > clock_timestamp() - INTERVAL '20 seconds' AND capabilities->>'workshopPreview' = 'true' LIMIT 1",
    );
    return result.rowCount === 1;
  }
  async cancel(projectId: string, jobId: string): Promise<void> {
    const db = this.req.payload.db as unknown as PostgresAdapter;
    // Одно UPDATE конкурирует с complete/renew на том же row lock; старый token перестаёт действовать.
    await db.pool.query(
      "UPDATE realize_design_preview_jobs SET state = 'cancelled', lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp() WHERE project_id = $1 AND job_id = $2 AND state IN ('queued','running')",
      [projectId, jobId],
    );
  }
}

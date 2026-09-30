/**
 * @file packages/payload-ai-plugin/src/design-workshop/DesignWorkshop.repository.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Выполняет scoped Local API запросы и CAS указателя в общей транзакции Payload.
 * @see documentation/specifications/design-workshop.md
 */
import type {
  PayloadRequest,
  RequiredDataFromCollectionSlug,
  Where,
} from "payload";
import {
  DESIGN_WORKSHOP_LIMITS,
  type DesignRevisionRef,
} from "@realize/ai-contracts";
import { EndpointError } from "../endpoints/http";
import {
  DESIGN_PROJECTS_SLUG,
  DESIGN_REVISIONS_SLUG,
  DESIGN_CHANGES_SLUG,
  DESIGN_OPERATIONS_SLUG,
} from "./designWorkshop.constants";
import type {
  DesignActor,
  DesignCollectionSlug,
  DesignProjectRecord,
} from "./DesignWorkshop.types";

/** Только доверенный facade вызывает overrideAccess; наружу возвращаются отдельные DTO. */
export class DesignWorkshopRepository {
  constructor(private readonly req: PayloadRequest) {}

  create<T extends DesignCollectionSlug>(
    collection: T,
    data: RequiredDataFromCollectionSlug<T>,
  ) {
    return this.req.payload.create({
      collection,
      data,
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
  }

  count(collection: DesignCollectionSlug, where: Where) {
    return this.req.payload.count({
      collection,
      where,
      overrideAccess: true,
      req: this.req,
    });
  }

  async ownedProject(projectId: string, actorId: DesignActor["id"]) {
    const result = await this.req.payload.find({
      collection: DESIGN_PROJECTS_SLUG,
      where: {
        and: [
          { projectId: { equals: projectId } },
          { owner: { equals: actorId } },
        ],
      },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req: this.req,
    });
    if (!result.docs[0])
      throw new EndpointError("NOT_FOUND", "Дизайн-проект не найден.", 404);
    return result.docs[0];
  }

  projects(
    actorId: DesignActor["id"],
    page: number,
    limit: number = DESIGN_WORKSHOP_LIMITS.pageSize,
  ) {
    return this.req.payload.find({
      collection: DESIGN_PROJECTS_SLUG,
      where: { owner: { equals: actorId } },
      page,
      limit,
      sort: "-createdAt",
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
  }

  async revision(projectId: string, revisionId: string) {
    const result = await this.req.payload.find({
      collection: DESIGN_REVISIONS_SLUG,
      where: {
        and: [
          { projectId: { equals: projectId } },
          { revisionId: { equals: revisionId } },
        ],
      },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req: this.req,
    });
    if (!result.docs[0])
      throw new EndpointError("NOT_FOUND", "Версия макета не найдена.", 404);
    return result.docs[0];
  }

  revisions(
    projectId: string,
    page: number,
    limit: number = DESIGN_WORKSHOP_LIMITS.pageSize,
  ) {
    return this.req.payload.find({
      collection: DESIGN_REVISIONS_SLUG,
      where: { projectId: { equals: projectId } },
      select: { revisionId: true, number: true, contentHash: true },
      page,
      limit,
      sort: "-number",
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
  }

  async change(projectId: string, changeId: string) {
    const result = await this.req.payload.find({
      collection: DESIGN_CHANGES_SLUG,
      where: {
        and: [
          { projectId: { equals: projectId } },
          { changeId: { equals: changeId } },
        ],
      },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req: this.req,
    });
    if (!result.docs[0])
      throw new EndpointError(
        "NOT_FOUND",
        "Подготовленная правка не найдена.",
        404,
      );
    return result.docs[0];
  }

  async replay(replayKey: string) {
    const result = await this.req.payload.find({
      collection: DESIGN_OPERATIONS_SLUG,
      where: { replayKey: { equals: replayKey } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req: this.req,
    });
    return result.docs[0];
  }

  async advance(project: DesignProjectRecord, next: DesignRevisionRef) {
    const result = await this.req.payload.update({
      collection: DESIGN_PROJECTS_SLUG,
      where: {
        and: [
          { projectId: { equals: project.projectId } },
          { currentRevisionId: { equals: project.currentRevisionId } },
          { currentHash: { equals: project.currentHash } },
        ],
      },
      data: {
        currentRevisionId: next.revisionId,
        currentRevisionNumber: next.number,
        currentHash: next.contentHash,
      },
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
    if (result.errors.length || result.docs.length !== 1)
      throw new EndpointError(
        "CONFLICT",
        "Базовая версия изменилась. Подготовьте правку заново.",
        409,
      );
  }

  markApplied(id: string | number, revisionId: string) {
    return this.req.payload.update({
      collection: DESIGN_CHANGES_SLUG,
      id,
      data: { appliedRevisionId: revisionId },
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
  }
}

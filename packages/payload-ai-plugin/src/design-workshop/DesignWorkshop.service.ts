/**
 * @file packages/payload-ai-plugin/src/design-workshop/DesignWorkshop.service.ts
 * @version 1.3.0
 * @date 2026-09-26
 * @description Координирует личные дизайн-проекты, immutable revisions и prepare/apply DB-снимков.
 * @see documentation/specifications/design-workshop.md
 */
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import type { z } from "zod";
import {
  ContractValidationError,
  DESIGN_WORKSHOP_LIMITS as limits,
  designWorkshopCommands as commands,
  type DesignMutationReceiptDto,
  type DesignPageDto,
  type DesignProjectDto,
  type DesignRevisionRef,
  type DesignWorkspaceSource,
} from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  normalizeDesignSnapshot,
  prepareDesignSnapshot,
  prepareDesignWorkspace,
} from "@realize/change-engine";
import { EndpointError } from "../endpoints/http";
import type { DesignWorkshopOptions } from "./DesignWorkshop.types";
import { DesignWorkshopRepository } from "./DesignWorkshop.repository";
import {
  DESIGN_PROJECTS_SLUG,
  DESIGN_REVISIONS_SLUG,
  DESIGN_CHANGES_SLUG,
} from "./designWorkshop.constants";
import {
  mapDesignProject,
  mapDesignRevisionRef,
  mapDesignRevision,
  mapDesignChange,
  readDesignSnapshot,
} from "./mapDesignWorkshop.mapper";
import { withDesignMutation } from "./withDesignMutation.service";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ContractValidationError(
      "Параметры Мастерской не соответствуют допустимой схеме.",
    );
  return result.data;
};
const conflict = (message: string): never => {
  throw new EndpointError("CONFLICT", message, 409);
};

/** Facade не принимает actor/channel/path от клиента и не запускает LLM или filesystem jobs. */
export class DesignWorkshop {
  private readonly repository: DesignWorkshopRepository;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: DesignWorkshopOptions,
  ) {
    this.repository = new DesignWorkshopRepository(req);
  }

  async authorize() {
    const actor = this.req.user;
    if (!actor)
      throw new EndpointError("UNAUTHENTICATED", "Требуется авторизация.", 401);
    if (
      actor.collection !== this.options.userCollection ||
      !(await this.options.access.canManageDesignWorkshop?.({ req: this.req }))
    )
      throw new EndpointError(
        "FORBIDDEN",
        "Нет доступа к Мастерской дизайна.",
        403,
      );
    return actor;
  }

  async list(query: unknown): Promise<DesignPageDto<DesignProjectDto>> {
    const actor = await this.authorize();
    const { page, limit } = parse(commands.list, query);
    const result = await this.repository.projects(actor.id, page, limit);
    return {
      items: result.docs.map(mapDesignProject),
      page,
      limit,
      hasNextPage: result.hasNextPage,
    };
  }

  async project(projectId: string): Promise<DesignProjectDto> {
    const actor = await this.authorize();
    return mapDesignProject(
      await this.repository.ownedProject(
        parse(commands.identifier, projectId),
        actor.id,
      ),
    );
  }

  async revisions(
    projectId: string,
    query: unknown,
  ): Promise<DesignPageDto<DesignRevisionRef>> {
    const actor = await this.authorize();
    parse(commands.identifier, projectId);
    const { page, limit } = parse(commands.list, query);
    await this.repository.ownedProject(projectId, actor.id);
    const result = await this.repository.revisions(projectId, page, limit);
    return {
      items: result.docs.map(mapDesignRevisionRef),
      page,
      limit,
      hasNextPage: result.hasNextPage,
    };
  }

  async revision(projectId: string, revisionId: string) {
    const actor = await this.authorize();
    parse(commands.identifier, projectId);
    parse(commands.identifier, revisionId);
    await this.repository.ownedProject(projectId, actor.id);
    return mapDesignRevision(
      await this.repository.revision(projectId, revisionId),
    );
  }

  /** Внутренний worker source: ACL проверяется заново, пути и pins берутся только из DB owner. */
  async workspaceSource(
    projectId: string,
    revisionId: string,
  ): Promise<DesignWorkspaceSource> {
    const actor = await this.authorize();
    parse(commands.identifier, projectId);
    parse(commands.identifier, revisionId);
    const project = await this.repository.ownedProject(projectId, actor.id);
    const revision = await this.repository.revision(projectId, revisionId);
    return prepareDesignWorkspace({
      pin: {
        schemaVersion: "1.0",
        bindingId: project.bindingId,
        projectId: project.projectId,
        revision: mapDesignRevisionRef(revision),
      },
      snapshot: readDesignSnapshot(revision.snapshot, revision.contentHash),
    }).source;
  }

  async change(projectId: string, changeId: string) {
    const actor = await this.authorize();
    parse(commands.identifier, projectId);
    parse(commands.identifier, changeId);
    await this.repository.ownedProject(projectId, actor.id);
    const change = await this.repository.change(projectId, changeId);
    const base = await this.repository.revision(
      projectId,
      change.baseRevisionId,
    );
    if (change.baseHash !== base.contentHash)
      throw new Error("Design change base integrity check failed.");
    return mapDesignChange(change, base);
  }

  async create(value: unknown): Promise<DesignMutationReceiptDto> {
    const actor = await this.authorize();
    const input = parse(commands.create, value);
    const snapshot = normalizeDesignSnapshot(input.snapshot);
    return withDesignMutation({
      req: this.req,
      repository: this.repository,
      actor,
      action: "create",
      projectId: null,
      command: { ...input, snapshot },
      operation: async () => {
        const count = await this.repository.count(DESIGN_PROJECTS_SLUG, {
          owner: { equals: actor.id },
        });
        if (count.totalDocs >= limits.projectsPerOwner)
          conflict("Достигнут лимит личных дизайн-проектов.");
        const projectId = randomUUID();
        const revision: DesignRevisionRef = {
          revisionId: randomUUID(),
          number: 1,
          contentHash: hashCanonicalJSON(snapshot),
        };
        await this.repository.create(DESIGN_PROJECTS_SLUG, {
          projectId,
          bindingId: randomUUID(),
          owner: actor.id,
          title: input.title,
          target: input.target,
          kind: input.kind,
          currentRevisionId: revision.revisionId,
          currentRevisionNumber: revision.number,
          currentHash: revision.contentHash,
        });
        await this.repository.create(DESIGN_REVISIONS_SLUG, {
          ...revision,
          projectId,
          parentRevisionId: null,
          snapshot,
          author: actor.id,
          channel: this.options.channel ?? "admin",
        });
        return { action: "create", projectId, revision, changeId: null };
      },
    });
  }

  async prepare(
    projectId: string,
    value: unknown,
  ): Promise<DesignMutationReceiptDto> {
    const actor = await this.authorize();
    parse(commands.identifier, projectId);
    const input = parse(commands.prepare, value);
    return withDesignMutation({
      req: this.req,
      repository: this.repository,
      actor,
      action: "prepare",
      projectId,
      command: input,
      operation: async () => {
        const project = await this.repository.ownedProject(projectId, actor.id);
        if (project.currentRevisionId !== input.baseRevisionId)
          conflict(
            "Базовая версия изменилась. Прочитайте текущую версию проекта.",
          );
        if (project.currentRevisionNumber >= limits.revisionsPerProject)
          conflict("Достигнут лимит версий макета.");
        const count = await this.repository.count(DESIGN_CHANGES_SLUG, {
          projectId: { equals: projectId },
        });
        if (count.totalDocs >= limits.changesPerProject)
          conflict("Достигнут лимит подготовленных правок.");
        const base = await this.repository.revision(
          projectId,
          input.baseRevisionId,
        );
        if (base.contentHash !== project.currentHash)
          throw new Error("Design head integrity check failed.");
        const candidate = prepareDesignSnapshot(
          readDesignSnapshot(base.snapshot, base.contentHash),
          input,
        );
        const changeId = randomUUID();
        await this.repository.create(DESIGN_CHANGES_SLUG, {
          changeId,
          projectId,
          baseRevisionId: base.revisionId,
          baseHash: base.contentHash,
          candidateHash: candidate.contentHash,
          candidate: candidate.snapshot,
          summary: input.summary,
          author: actor.id,
          expiresAt: new Date(Date.now() + limits.changeTtlMs).toISOString(),
          appliedRevisionId: null,
        });
        return {
          action: "prepare",
          projectId,
          revision: mapDesignRevisionRef(base),
          changeId,
        };
      },
    });
  }

  async apply(
    projectId: string,
    changeId: string,
    value: unknown,
  ): Promise<DesignMutationReceiptDto> {
    const actor = await this.authorize();
    parse(commands.identifier, projectId);
    parse(commands.identifier, changeId);
    parse(commands.apply, value);
    return withDesignMutation({
      req: this.req,
      repository: this.repository,
      actor,
      action: "apply",
      projectId,
      command: { changeId },
      operation: async () => {
        const project = await this.repository.ownedProject(projectId, actor.id);
        const change = await this.repository.change(projectId, changeId);
        if (change.appliedRevisionId)
          conflict(
            "Правка уже применена. Повторите исходный Idempotency-Key для её квитанции.",
          );
        if (Date.parse(change.expiresAt) <= Date.now())
          conflict("Срок подготовленной правки истёк. Подготовьте её заново.");
        if (
          project.currentRevisionId !== change.baseRevisionId ||
          project.currentHash !== change.baseHash
        )
          conflict("Базовая версия изменилась. Подготовьте правку заново.");
        if (project.currentRevisionNumber >= limits.revisionsPerProject)
          conflict("Достигнут лимит версий макета.");
        const snapshot = readDesignSnapshot(
          change.candidate,
          change.candidateHash,
        );
        const revision: DesignRevisionRef = {
          revisionId: randomUUID(),
          number: project.currentRevisionNumber + 1,
          contentHash: change.candidateHash,
        };
        await this.repository.create(DESIGN_REVISIONS_SLUG, {
          ...revision,
          projectId,
          parentRevisionId: change.baseRevisionId,
          snapshot,
          author: actor.id,
          channel: this.options.channel ?? "admin",
        });
        await this.repository.advance(project, revision);
        await this.repository.markApplied(change.id, revision.revisionId);
        return { action: "apply", projectId, revision, changeId };
      },
    });
  }
}

/**
 * @file packages/payload-ai-plugin/src/design-workshop/DesignPreview.service.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Авторизует создание, чтение, отмену и выдачу снимков точной версии.
 * @see documentation/specifications/design-workshop.md
 */
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import {
  ContractValidationError,
  DESIGN_PREVIEW,
  designPreviewRequestSchema,
  designWorkshopCommands,
  type DesignPreviewJobDto,
  type McpWorkshopIdentity,
} from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  validateDesignPreviewArtifact,
} from "@realize/change-engine";
import { EndpointError } from "../endpoints/http";
import { idempotencyKeyFor } from "../endpoints/request";
import { DesignWorkshop } from "./DesignWorkshop.service";
import { DesignPreviewRepository } from "./DesignPreview.repository";
import { mapDesignPreview } from "./mapDesignPreview.mapper";
import { withDesignTransaction } from "./withDesignTransaction.repository";
import type { DesignWorkshopOptions } from "./DesignWorkshop.types";

export class DesignPreview {
  private readonly workshop: DesignWorkshop;
  private readonly repository: DesignPreviewRepository;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: DesignWorkshopOptions,
    private readonly mcpAuthorization?: McpWorkshopIdentity,
  ) {
    this.workshop = new DesignWorkshop(req, options);
    this.repository = new DesignPreviewRepository(req);
  }
  async authorize(projectId: string) {
    const actor = await this.workshop.authorize();
    if (
      !(await this.options.access.canPreviewDesignWorkshop?.({ req: this.req }))
    )
      throw new EndpointError(
        "FORBIDDEN",
        "Нет разрешения на предпросмотр макета.",
        403,
      );
    await this.workshop.project(projectId);
    return actor;
  }
  async start(projectId: string, value: unknown): Promise<DesignPreviewJobDto> {
    const actor = await this.authorize(projectId);
    const parsed = designPreviewRequestSchema.safeParse(value);
    if (!parsed.success)
      throw new ContractValidationError(
        "Укажите сохранённую версию и React entry point.",
      );
    const input = parsed.data;
    const requestKey = hashCanonicalJSON({
      action: "design-preview",
      actorId: String(actor.id),
      key: idempotencyKeyFor(this.req),
    });
    const requestHash = hashCanonicalJSON({
      projectId,
      ...input,
      renderer: DESIGN_PREVIEW.renderer,
    });
    return withDesignTransaction(
      this.req,
      String(actor.id),
      projectId,
      async () => {
        const source = await this.workshop.workspaceSource(
          projectId,
          input.revisionId,
        );
        const prior = await this.repository.replay(requestKey);
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new EndpointError(
              "CONFLICT",
              "Idempotency-Key уже использован для другого preview.",
              409,
            );
          return mapDesignPreview(prior);
        }
        if (
          !source.snapshot.files.some((file) => file.path === input.entryPath)
        )
          throw new ContractValidationError(
            "Entry point отсутствует в выбранной версии.",
          );
        const counts = await this.repository.counts(projectId);
        if (counts.all >= DESIGN_PREVIEW.jobsPerProject || counts.active > 0)
          throw new EndpointError(
            "CONFLICT",
            "Достигнут лимит заданий или уже выполняется preview проекта.",
            409,
          );
        if (!(await this.repository.available()))
          throw new EndpointError(
            "INTEGRATION_UNAVAILABLE",
            "Исполнитель sandbox preview недоступен.",
            503,
          );
        return mapDesignPreview(
          await this.repository.create({
            jobId: randomUUID(),
            projectId,
            revisionId: input.revisionId,
            requestedBy: actor.id,
            sourcePin: source.pin,
            mcpAuthorization: this.mcpAuthorization ?? null,
            entryPath: input.entryPath,
            requestKey,
            requestHash,
            state: "queued",
            attempt: 0,
            expiresAt: new Date(
              Date.now() + DESIGN_PREVIEW.ttlSeconds * 1000,
            ).toISOString(),
          }),
        );
      },
    );
  }
  async get(projectId: string, jobId: string) {
    await this.authorize(projectId);
    if (!designWorkshopCommands.identifier.safeParse(jobId).success)
      throw new ContractValidationError("Недопустимый идентификатор preview.");
    return mapDesignPreview(await this.repository.job(projectId, jobId));
  }
  async list(projectId: string) {
    await this.authorize(projectId);
    return {
      items: (await this.repository.list(projectId)).map(mapDesignPreview),
    };
  }
  async cancel(projectId: string, jobId: string, input: unknown) {
    await this.get(projectId, jobId);
    if (!designWorkshopCommands.apply.safeParse(input).success)
      throw new ContractValidationError(
        "Отмена preview не принимает параметры.",
      );
    await this.repository.cancel(projectId, jobId);
    return this.get(projectId, jobId);
  }
  async image(
    projectId: string,
    jobId: string,
    width: string,
  ): Promise<Buffer> {
    await this.get(projectId, jobId);
    if (!["390", "768", "1440"].includes(width))
      throw new EndpointError("NOT_FOUND", "Снимок не найден.", 404);
    const row = await this.repository.job(projectId, jobId, true);
    const job = mapDesignPreview(row);
    if (job.state !== "completed" || !job.evidence)
      throw new EndpointError(
        "CONFLICT",
        "Снимок ещё не готов или срок его действия истёк.",
        409,
      );
    let artifact;
    try {
      artifact = validateDesignPreviewArtifact(job.evidence, row.images);
    } catch {
      throw new Error("Preview artifact integrity failure");
    }
    if (
      hashCanonicalJSON(artifact.evidence.source) !==
      hashCanonicalJSON(job.source)
    )
      throw new Error("Preview source integrity failure");
    return Buffer.from(
      artifact.images[width as keyof typeof artifact.images],
      "base64",
    );
  }
}

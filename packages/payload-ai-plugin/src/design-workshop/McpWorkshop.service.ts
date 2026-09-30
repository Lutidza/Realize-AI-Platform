/**
 * @file packages/payload-ai-plugin/src/design-workshop/McpWorkshop.service.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Выполняет bounded MCP команды через общий Workshop owner и действующий actor.
 * @see documentation/specifications/design-workshop.md
 */
import { createHash } from "node:crypto";
import type { CollectionSlug, Payload } from "payload";
import {
  ContractValidationError,
  mcpWorkshopInputs,
  MCP_WORKSHOP_POLICY,
  type McpWorkshopIdentity,
  type McpWorkshopToolName,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { readRuntimeActor } from "../runtime/readRuntimeActor.service";
import { EndpointError } from "../endpoints/http";
import { withMcpTransaction } from "../integrations/mcp/withMcpTransaction.service";
import { assertMcpWorkshopAccess } from "../integrations/mcp/assertMcpWorkshopAccess.service";
import { DesignWorkshop } from "./DesignWorkshop.service";
import { DesignPreview } from "./DesignPreview.service";
import { createMcpPreviewImage } from "./createMcpPreviewImage.adapter";

export async function executeMcpWorkshop(
  payload: Payload,
  userID: string,
  identity: McpWorkshopIdentity,
  name: McpWorkshopToolName,
  input: unknown,
  signal: AbortSignal,
  responseBytes: number,
): Promise<unknown> {
  const parsed = mcpWorkshopInputs[name].safeParse(input);
  if (!parsed.success)
    throw new ContractValidationError("Некорректная команда Мастерской.");
  const { req, runtime } = await readRuntimeActor(payload, userID);
  const options = {
    userCollection: (runtime.userCollection ??
      payload.config.admin.user) as CollectionSlug,
    access: {
      canManageDesignWorkshop: runtime.canManageDesignWorkshop,
      canPreviewDesignWorkshop: runtime.canPreviewDesignWorkshop,
    },
    channel: "mcp" as const,
  };
  const workshop = new DesignWorkshop(req, options);
  const preview = new DesignPreview(req, options, identity);
  if ("idempotencyKey" in parsed.data)
    req.headers.set(
      "idempotency-key",
      hashCanonicalJSON({
        channel: "mcp",
        ...identity,
        key: parsed.data.idempotencyKey,
      }),
    );
  const active = () => {
    if (signal.aborted)
      throw new EndpointError(
        "INTEGRATION_UNAVAILABLE",
        "Запрос прерван. Для записи повторите тот же idempotencyKey.",
        503,
      );
  };
  const ref = (revision: {
    revisionId: string;
    number: number;
    contentHash: string;
  }) => ({
    revisionId: revision.revisionId,
    number: revision.number,
    contentHash: revision.contentHash,
  });
  const work = async () => {
    active();
    await assertMcpWorkshopAccess(req, identity, name);
    await workshop.authorize();
    switch (name) {
      case "workshop_projects_list":
        return workshop.list(mcpWorkshopInputs[name].parse(input));
      case "workshop_project_get": {
        const v = mcpWorkshopInputs[name].parse(input);
        const project = await workshop.project(v.projectId);
        const revision = await workshop.revision(
          v.projectId,
          v.revisionId ?? project.currentRevision.revisionId,
        );
        const offset = (v.page - 1) * 8;
        return {
          project,
          revision: ref(revision),
          files: revision.snapshot.files.slice(offset, offset + 8).map((f) => ({
            path: f.path,
            bytes: Buffer.byteLength(f.content),
            sha256: createHash("sha256").update(f.content).digest("hex"),
          })),
          page: v.page,
          hasNextPage: offset + 8 < revision.snapshot.files.length,
        };
      }
      case "workshop_snapshot_read": {
        const v = mcpWorkshopInputs[name].parse(input);
        const revision = await workshop.revision(v.projectId, v.revisionId);
        const file =
          v.section === "file"
            ? revision.snapshot.files.find((f) => f.path === v.path)
            : undefined;
        if (v.section === "file" && !file)
          throw new EndpointError("NOT_FOUND", "Файл макета не найден.", 404);
        const all = Array.from(
          file
            ? file.content
            : JSON.stringify(
                revision.snapshot[v.section as "brief" | "sources"],
              ),
        );
        if (v.offset > all.length)
          throw new ContractValidationError(
            "Смещение превышает размер материала.",
          );
        // UTF-16 string limit и wire budget соблюдаются даже для astral symbols и JSON escapes.
        const take = Math.min(
          v.limit,
          Math.max(1, Math.floor((responseBytes - 4096) / 24)),
        );
        let text = all.slice(v.offset, v.offset + take).join("");
        while (text.length > 4096)
          text = Array.from(text).slice(0, -1).join("");
        const next = v.offset + Array.from(text).length;
        return {
          revision: ref(revision),
          section: v.section,
          path: v.path ?? null,
          text,
          offset: v.offset,
          nextOffset: next < all.length ? next : null,
          totalCharacters: all.length,
        };
      }
      case "workshop_project_create": {
        const { idempotencyKey: _key, ...command } =
          mcpWorkshopInputs[name].parse(input);
        void _key;
        return workshop.create(command);
      }
      case "workshop_change_prepare": {
        const {
          projectId,
          idempotencyKey: _key,
          ...command
        } = mcpWorkshopInputs[name].parse(input);
        void _key;
        return workshop.prepare(projectId, command);
      }
      case "workshop_change_get": {
        const v = mcpWorkshopInputs[name].parse(input),
          change = await workshop.change(v.projectId, v.changeId);
        const offset = (v.page - 1) * 8;
        return {
          projectId: change.projectId,
          changeId: change.changeId,
          baseRevision: change.baseRevision,
          candidateHash: change.candidateHash,
          summary: Array.from(change.summary)
            .slice(0, Math.min(1000, Math.floor((responseBytes - 4096) / 24)))
            .join(""),
          summaryTruncated:
            Array.from(change.summary).length >
            Math.min(1000, Math.floor((responseBytes - 4096) / 24)),
          status: change.status,
          briefChanged: change.diff.briefChanged,
          sourcesChanged: change.diff.sourcesChanged,
          files: change.diff.files.slice(offset, offset + 8),
          page: v.page,
          hasNextPage: offset + 8 < change.diff.files.length,
        };
      }
      case "workshop_change_apply": {
        const v = mcpWorkshopInputs[name].parse(input),
          change = await workshop.change(v.projectId, v.changeId);
        if (change.candidateHash !== v.candidateHash)
          throw new EndpointError(
            "CONFLICT",
            "Подготовленная правка не совпадает с проверенным hash.",
            409,
          );
        return workshop.apply(v.projectId, v.changeId, {});
      }
      case "workshop_preview_start": {
        const {
          projectId,
          idempotencyKey: _key,
          ...command
        } = mcpWorkshopInputs[name].parse(input);
        void _key;
        return preview.start(projectId, command);
      }
      case "workshop_preview_get": {
        const v = mcpWorkshopInputs[name].parse(input);
        return preview.get(v.projectId, v.jobId);
      }
      case "workshop_preview_cancel": {
        const v = mcpWorkshopInputs[name].parse(input);
        return preview.cancel(v.projectId, v.jobId, {});
      }
      case "workshop_preview_image": {
        const v = mcpWorkshopInputs[name].parse(input);
        const job = await preview.get(v.projectId, v.jobId);
        return createMcpPreviewImage(
          await preview.image(v.projectId, v.jobId, String(v.width)),
          job,
          v.width,
          responseBytes,
        );
      }
    }
  };
  // Общий MCP lock не позволяет concurrent revoke обогнать подтверждённую запись.
  return withMcpTransaction(req, identity.serverID, async () => {
    const result = await work();
    active();
    if (MCP_WORKSHOP_POLICY[name].effect !== "read")
      await assertMcpWorkshopAccess(req, identity, name);
    return result;
  });
}

/**
 * @file packages/payload-ai-plugin/src/design-workshop/readDesignPreviewSource.service.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Повторно проверяет actor и preview permission перед фоновой работой.
 * @see documentation/specifications/design-workshop.md
 */
import type { McpWorkshopIdentity } from "@realize/ai-contracts";
import { assertMcpWorkshopAccess } from "../integrations/mcp/assertMcpWorkshopAccess.service";
import type { CollectionSlug, Payload } from "payload";
import { EndpointError } from "../endpoints/http";
import { readRuntimeActor } from "../runtime/readRuntimeActor.service";
import { DesignWorkshop } from "./DesignWorkshop.service";

export async function readDesignPreviewSource(
  payload: Payload,
  actorId: string,
  projectId: string,
  revisionId: string,
  identity?: McpWorkshopIdentity,
) {
  const { req, runtime } = await readRuntimeActor(payload, actorId);
  if (identity)
    await assertMcpWorkshopAccess(req, identity, "workshop_preview_start");
  if (!(await runtime.canPreviewDesignWorkshop?.({ req })))
    throw new EndpointError(
      "FORBIDDEN",
      "Нет разрешения на предпросмотр макета.",
      403,
    );
  return new DesignWorkshop(req, {
    userCollection: (runtime.userCollection ??
      payload.config.admin.user) as CollectionSlug,
    access: { canManageDesignWorkshop: runtime.canManageDesignWorkshop },
  }).workspaceSource(projectId, revisionId);
}

/**
 * @file packages/payload-ai-plugin/src/design-workshop/DesignWorkshop.types.ts
 * @version 1.2.0
 * @date 2026-09-26
 * @description Связывает generated Payload types с внутренней атомарной операцией Мастерской.
 * @see documentation/specifications/design-workshop.md
 */
import type { DataFromCollectionSlug, PayloadRequest } from "payload";
import type { DesignMutationReceiptDto } from "@realize/ai-contracts";
import type { DesignWorkshopRepository } from "./DesignWorkshop.repository";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type {
  DESIGN_PROJECTS_SLUG,
  DESIGN_REVISIONS_SLUG,
  DESIGN_CHANGES_SLUG,
  DESIGN_OPERATIONS_SLUG,
} from "./designWorkshop.constants";

export type DesignProjectRecord = DataFromCollectionSlug<
  typeof DESIGN_PROJECTS_SLUG
>;
export type DesignRevisionRecord = DataFromCollectionSlug<
  typeof DESIGN_REVISIONS_SLUG
>;
export type DesignChangeRecord = DataFromCollectionSlug<
  typeof DESIGN_CHANGES_SLUG
>;
export type DesignCollectionSlug =
  | typeof DESIGN_PROJECTS_SLUG
  | typeof DESIGN_REVISIONS_SLUG
  | typeof DESIGN_CHANGES_SLUG
  | typeof DESIGN_OPERATIONS_SLUG;
export type DesignActor = NonNullable<PayloadRequest["user"]>;
export type DesignWorkshopOptions = {
  channel?: "admin" | "mcp";
  userCollection: SanitizedRealizeAIPluginOptions["userCollection"];
  access: Pick<
    SanitizedRealizeAIPluginOptions["access"],
    "canManageDesignWorkshop" | "canPreviewDesignWorkshop"
  >;
};
export type DesignRevisionSummary = Pick<
  DesignRevisionRecord,
  "revisionId" | "number" | "contentHash"
>;
export type DesignMutationContext = {
  req: PayloadRequest;
  repository: DesignWorkshopRepository;
  actor: DesignActor;
  action: DesignMutationReceiptDto["action"];
  projectId: string | null;
  command: unknown;
  operation: () => Promise<Omit<DesignMutationReceiptDto, "operationId">>;
};

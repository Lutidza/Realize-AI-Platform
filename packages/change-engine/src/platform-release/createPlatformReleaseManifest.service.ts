/**
 * @file packages/change-engine/src/platform-release/createPlatformReleaseManifest.service.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Связывает точный source inventory с образом, Git и происхождением сборки.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import {
  platformReleasePayloadSchema,
  type PlatformReleaseManifest,
} from "@realize/ai-contracts/platform-release";
import { hashCanonicalJSON } from "../canonicalJson.ts";
import { assertGitDeliveryRequest } from "./assertGitDeliveryRequest.validator.ts";
import { verifyPlatformSourceInventory } from "./verifyPlatformSourceInventory.validator.ts";

/** Детерминированный manifest для заданных входов; hash не утверждает наличие подписи. */
export const createPlatformReleaseManifest = (
  value: unknown,
): PlatformReleaseManifest => {
  const payload = platformReleasePayloadSchema.parse(value);
  const inventory = verifyPlatformSourceInventory(payload.inventory);
  if (payload.inventoryHash !== hashCanonicalJSON(inventory))
    throw new Error("Source inventory hash mismatch");
  const { git, commit, ref } = payload.source;
  assertGitDeliveryRequest(git, {
    purpose: "platform-core",
    connectionId: git.connectionId,
    revision: git.revision,
    principalId: git.principalId,
    repositoryId: git.repository.id,
    action: "publish-release",
    ref,
  });
  const workflowRecorded = inventory.components.some(
    (component) =>
      component.kind === "ci-policy" &&
      component.files.some((file) => file.path === payload.build.workflowPath),
  );
  if (payload.build.workflowCommit !== commit || !workflowRecorded) {
    throw new Error(
      "Build workflow must be pinned to the release source and inventory",
    );
  }
  return { ...payload, manifestHash: hashCanonicalJSON(payload) };
};

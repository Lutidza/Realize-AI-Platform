/**
 * @file packages/change-engine/src/platform-release/assertGitDeliveryRequest.validator.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет запрос против раздельной server-owned Git policy перед delivery.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import {
  gitDeliveryBindingSchema,
  gitDeliveryRequestSchema,
} from "@realize/ai-contracts/platform-release";

/** Caller получает binding из доверенного хранилища; эта проверка не заменяет authentication. */
export const assertGitDeliveryRequest = (
  trustedBinding: unknown,
  request: unknown,
): void => {
  const binding = gitDeliveryBindingSchema.parse(trustedBinding);
  const operation = gitDeliveryRequestSchema.parse(request);
  if (
    binding.purpose !== operation.purpose ||
    binding.connectionId !== operation.connectionId ||
    binding.revision !== operation.revision ||
    binding.principalId !== operation.principalId ||
    binding.repository.id !== operation.repositoryId ||
    (binding.purpose === "customer-project"
      ? binding.installationId !== operation.installationId
      : operation.installationId !== undefined) ||
    !binding.allowedActions.includes(operation.action) ||
    !binding.allowedRefs.includes(operation.ref)
  ) {
    throw new Error(
      "Git delivery request is outside the trusted connection scope",
    );
  }
};

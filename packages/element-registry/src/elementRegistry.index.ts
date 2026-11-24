/**
 * @file packages/element-registry/src/elementRegistry.index.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Экспортирует browser-safe контракты и schemas первого owner registry без Node runtime.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
export {
  elementNamespaceSchema,
  elementIdSchema,
  elementIdentitySchema,
  elementOwnerRefSchema,
} from "./elementIdentity.schemas";
export {
  rootProjectRegistrationSchema,
  packageOwnerRegistrationSchema,
  ownerPackageBindingSchema,
  trustedOwnerPackageSchema,
  ownerRegistryInputSchema,
} from "./ownerRegistry.schemas";
export { OwnerRegistryError } from "./OwnerRegistry.error";
export { getElementIdentityKey } from "./getElementIdentityKey.util";
export type {
  ElementNamespace,
  ElementId,
  ElementIdentity,
  ElementOwnerRef,
  RootProjectRegistration,
  PackageOwnerRegistration,
  RootProjectRegistrationInput,
  PackageOwnerRegistrationInput,
  OwnerPackageBindingInput,
  TrustedOwnerPackageInput,
  OwnerRegistration,
  ResolvedOwnerPackageBinding,
  OwnerRegistryInput,
  OwnerRegistrySnapshot,
  ResolvedElementOwner,
  OwnerRegistryErrorCode,
} from "./OwnerRegistry.types";

/**
 * @file packages/element-registry/src/OwnerRegistry.types.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Описывает неизменяемый snapshot владельцев без runtime grants или installation state.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type { z } from "zod";
import type {
  elementIdSchema,
  elementIdentitySchema,
  elementNamespaceSchema,
  elementOwnerRefSchema,
} from "./elementIdentity.schemas";
import type {
  ownerPackageBindingSchema,
  ownerRegistryInputSchema,
  packageOwnerRegistrationSchema,
  rootProjectRegistrationSchema,
  trustedOwnerPackageSchema,
} from "./ownerRegistry.schemas";

type ReadonlyValue<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer Item)[]
    ? readonly ReadonlyValue<Item>[]
    : { readonly [Key in keyof T]: ReadonlyValue<T[Key]> };

declare const ownerRegistrySnapshotBrand: unique symbol;

/** Проверенный namespace token; его наличие не подтверждает authority публикации. */
export type ElementNamespace = z.output<typeof elementNamespaceSchema>;
/** Проверенный local token с сохранением исходного регистра. */
export type ElementId = z.output<typeof elementIdSchema>;
/** Постоянная идентичность не включает kind, версию, путь или поставку. */
export type ElementIdentity = ReadonlyValue<
  z.output<typeof elementIdentitySchema>
>;
/** Logical owner разрешается против выбранного snapshot. */
export type ElementOwnerRef = ReadonlyValue<
  z.output<typeof elementOwnerRefSchema>
>;
/** Терминальная регистрация project, известная host до чтения contributions. */
export type RootProjectRegistration = ReadonlyValue<
  z.output<typeof rootProjectRegistrationSchema>
>;
/** Регистрация package не обязана иметь delivery binding в этом срезе. */
export type PackageOwnerRegistration = ReadonlyValue<
  z.output<typeof packageOwnerRegistrationSchema>
>;
/** Authored root registration до runtime validation и создания branded tokens. */
export type RootProjectRegistrationInput = z.input<
  typeof rootProjectRegistrationSchema
>;
/** Authored package registration не требует заранее создавать output brands. */
export type PackageOwnerRegistrationInput = z.input<
  typeof packageOwnerRegistrationSchema
>;
/** Authored binding проверяется отдельно от package registration и metadata. */
export type OwnerPackageBindingInput = z.input<
  typeof ownerPackageBindingSchema
>;
/** Явно переданные host metadata для проверки bindings. */
export type TrustedOwnerPackageInput = z.input<
  typeof trustedOwnerPackageSchema
>;
/** Допустимые регистрации первого среза; module не подразумевается автоматически. */
export type OwnerRegistration =
  RootProjectRegistration | PackageOwnerRegistration;
/** Разрешённая metadata точного package; exports содержит только требовавшиеся публичные входы. */
export type ResolvedOwnerPackageBinding = ReadonlyValue<
  z.output<typeof ownerPackageBindingSchema> & {
    exports: Record<string, string>;
  }
>;
/** Raw input для trusted host composition; brands появляются только после runtime validation. */
export type OwnerRegistryInput = z.input<typeof ownerRegistryInputSchema>;
/** Внутренний результат строгой проверки входа до graph/package validation. */
export type ParsedOwnerRegistryInput = z.output<
  typeof ownerRegistryInputSchema
>;
/** Detached snapshot; возвращаемый compiler объект рекурсивно заморожен. */
export type OwnerRegistrySnapshot = Readonly<{
  schemaVersion: "1.0";
  rootProject: ElementIdentity;
  registrations: readonly OwnerRegistration[];
  packageBindings: readonly ResolvedOwnerPackageBinding[];
  snapshotHash: string;
}> & { readonly [ownerRegistrySnapshotBrand]: true };
/** Read-only результат owner lookup; он не содержит прав пользователя или execution grants. */
export type ResolvedElementOwner = Readonly<{
  identity: ElementIdentity;
  kind: OwnerRegistration["kind"];
  title: string;
  rootProject: ElementIdentity;
  snapshotHash: string;
}>;
/** Стабильные коды admission и graph validation без включения исходного input в сообщение. */
export type OwnerRegistryErrorCode =
  | "INVALID_INPUT"
  | "DUPLICATE_IDENTITY"
  | "UNKNOWN_OWNER"
  | "OWNER_CYCLE"
  | "DUPLICATE_PACKAGE_BINDING"
  | "UNKNOWN_PACKAGE_OWNER"
  | "INVALID_PACKAGE_OWNER"
  | "DUPLICATE_TRUSTED_PACKAGE"
  | "PACKAGE_NAME_MISMATCH"
  | "PACKAGE_VERSION_MISMATCH"
  | "PACKAGE_EXPORT_UNAVAILABLE";

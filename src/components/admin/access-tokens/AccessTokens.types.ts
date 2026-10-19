/**
 * @file src/components/admin/access-tokens/AccessTokens.types.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Описывает browser представление доступов поверх публичных package DTO.
 * @see documentation/architecture/platform-access.md
 */
import type { ReactNode } from "react";
import type {
  AccessContextDto,
  AccessCreateInput,
  AccessCreateResult,
  AccessTokenDto,
} from "@realize/payload-access-management/contracts";
import type { SystemAdminContext } from "../system-shell/systemAdmin.types";
import type { useAccessTokens } from "./useAccessTokens.hook";

export type AccessCenterProps = SystemAdminContext & {
  initialOwnerId?: string;
  /** Команда содержит только доверенный public URL, без credentials. */
  cliLoginCommand: string;
};
export type AccessShellProps = {
  context: SystemAdminContext;
  title: string;
  children: ReactNode;
};
export type AccessTokensViewProps = {
  manager: ReturnType<typeof useAccessTokens>;
  mode: "light" | "dark";
  cliLoginCommand: string;
};
export type AccessCreateDialogProps = {
  open: boolean;
  mode: "light" | "dark";
  scopes: AccessContextDto["scopes"];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: AccessCreateInput) => Promise<boolean>;
};
export type AccessSecretDialogProps = {
  created: AccessCreateResult | null;
  mode: "light" | "dark";
  onForget: () => void;
};
export type AccessTokenCardProps = {
  token: AccessTokenDto;
  scopes: AccessContextDto["scopes"];
  busy: boolean;
  onRevoke: (token: AccessTokenDto) => void;
};
export type AccessPageProps = {
  searchParams: Promise<{ ownerId?: string | string[] }>;
};

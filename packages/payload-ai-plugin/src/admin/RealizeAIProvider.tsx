/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIProvider.tsx
 * @version 2026-08-18
 * @description Installs one authorized AI runtime and drawer across Payload Admin routes.
 */

"use client";

import { useAuth, useConfig, useModal } from "@payloadcms/ui";
import { usePathname } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { RealizeAIContext } from "./RealizeAIContext";
import { RealizeAIDrawer, REALIZE_AI_DRAWER_SLUG } from "./RealizeAIDrawer";
import { useRealizeAIChat } from "./useRealizeAIChat";

type RealizeAIProviderProps = {
  children?: ReactNode;
  route: `/${string}`;
};

const rolesOf = (user: unknown): string[] => {
  const roles = (user as { roles?: unknown } | null)?.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === "string")
    : [];
};

const AuthorizedAIProvider = ({ children, route }: RealizeAIProviderProps) => {
  const { config } = useConfig();
  const { closeModal, modalState } = useModal();
  const pathname = usePathname();
  const fullPageURL = formatAdminURL({
    adminRoute: config.routes.admin,
    path: route,
  });
  const isFullPage = pathname === fullPageURL;
  const isDrawerOpen = Boolean(modalState[REALIZE_AI_DRAWER_SLUG]?.isOpen);
  const controller = useRealizeAIChat(isDrawerOpen || isFullPage);

  useEffect(() => {
    if (isFullPage && isDrawerOpen) closeModal(REALIZE_AI_DRAWER_SLUG);
  }, [closeModal, isDrawerOpen, isFullPage]);

  return (
    <RealizeAIContext value={controller}>
      {children}
      <RealizeAIDrawer hidden={isFullPage} />
    </RealizeAIContext>
  );
};

/** Preserves the Admin tree and exposes AI UI only to authenticated admins. */
export const RealizeAIProvider = ({
  children,
  route,
}: RealizeAIProviderProps) => {
  const { user } = useAuth();
  if (!rolesOf(user).includes("admin")) return children;
  return <AuthorizedAIProvider route={route}>{children}</AuthorizedAIProvider>;
};

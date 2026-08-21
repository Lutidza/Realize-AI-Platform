/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAINavLink.tsx
 * @version 2026-08-17
 * @description Adds the gated AI and Delivery entry to Payload navigation.
 */

"use client";

import { Link, NavGroup, useAuth, useConfig } from "@payloadcms/ui";
import { usePathname } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";

type Props = {
  route: `/${string}`;
};

/** Adds the plugin route only for an authenticated Payload admin. */
export const RealizeAINavLink = ({ route }: Props) => {
  const { user } = useAuth();
  const { config } = useConfig();
  const pathname = usePathname();
  const rawRoles = (user as unknown as { roles?: unknown } | null)?.roles;
  const roles = Array.isArray(rawRoles)
    ? rawRoles.filter((role): role is string => typeof role === "string")
    : [];

  if (!roles.includes("admin")) return null;

  const href = formatAdminURL({ adminRoute: config.routes.admin, path: route });
  const label = (
    <>
      {pathname === href ? <div className="nav__link-indicator" /> : null}
      <span className="nav__link-label">AI-ассистент</span>
    </>
  );

  return (
    <NavGroup isOpen label="AI & Delivery">
      {pathname === href ? (
        <div className="nav__link" id="nav-realize-ai">
          {label}
        </div>
      ) : (
        <Link
          className="nav__link"
          href={href}
          id="nav-realize-ai"
          prefetch={false}
        >
          {label}
        </Link>
      )}
    </NavGroup>
  );
};

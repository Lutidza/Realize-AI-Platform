/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAINavLink.tsx
 * @version 2026-08-27
 * @description Adds gated AI assistant and integrations entries to Payload navigation.
 */

"use client";

import { Link, NavGroup, useAuth, useConfig } from "@payloadcms/ui";
import { usePathname } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";

type Props = {
  group: string;
  integrationsRoute: `/${string}`;
  route: `/${string}`;
};

/** Adds the plugin route only for an authenticated Payload admin. */
export const RealizeAINavLink = ({
  group,
  integrationsRoute,
  route,
}: Props) => {
  const { user } = useAuth();
  const { config } = useConfig();
  const pathname = usePathname();
  const rawRoles = (user as unknown as { roles?: unknown } | null)?.roles;
  const roles = Array.isArray(rawRoles)
    ? rawRoles.filter((role): role is string => typeof role === "string")
    : [];

  if (!roles.includes("admin")) return null;

  const links = [
    { id: "nav-realize-ai", label: "AI-ассистент", route },
    {
      id: "nav-realize-integrations",
      label: "Интеграции",
      route: integrationsRoute,
    },
  ];

  return (
    <NavGroup isOpen label={group}>
      {links.map((item) => {
        const href = formatAdminURL({
          adminRoute: config.routes.admin,
          path: item.route,
        });
        const label = (
          <>
            {pathname === href ? <div className="nav__link-indicator" /> : null}
            <span className="nav__link-label">{item.label}</span>
          </>
        );
        return pathname === href ? (
          <div className="nav__link" id={item.id} key={item.id}>
            {label}
          </div>
        ) : (
          <Link
            className="nav__link"
            href={href}
            id={item.id}
            key={item.id}
            prefetch={false}
          >
            {label}
          </Link>
        );
      })}
    </NavGroup>
  );
};

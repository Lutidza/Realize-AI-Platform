/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAINavLink.view.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает навигацию и выделяет текущий раздел Admin.
 */

"use client";

import { Link, NavGroup } from "@payloadcms/ui";
import type { RealizeAINavLinkViewProps } from "./RealizeAINavLink.types";

export const RealizeAINavLinkView = ({
  group,
  links,
}: RealizeAINavLinkViewProps) =>
  links.length ? (
    <NavGroup isOpen label={group}>
      {links.map((item) => {
        const label = (
          <>
            {item.isActive ? <div className="nav__link-indicator" /> : null}
            <span className="nav__link-label">{item.label}</span>
          </>
        );
        return item.isCurrentPage ? (
          <div className="nav__link" id={item.id} key={item.id}>
            {label}
          </div>
        ) : (
          <Link
            className="nav__link"
            href={item.href}
            id={item.id}
            key={item.id}
            prefetch={false}
          >
            {label}
          </Link>
        );
      })}
    </NavGroup>
  ) : null;

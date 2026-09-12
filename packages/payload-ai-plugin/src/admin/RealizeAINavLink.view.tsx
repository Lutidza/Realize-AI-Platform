/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAINavLink.view.tsx
 * @version 1.2.0
 * @date 2026-09-10
 * @description Отображает навигацию и выделяет текущий раздел Admin.
 */

"use client";

import { Link, NavGroup } from "@payloadcms/ui";
import type { MouseEvent } from "react";
import type { RealizeAINavLinkViewProps } from "./RealizeAINavLink.types";

export const RealizeAINavLinkView = ({ groups }: RealizeAINavLinkViewProps) =>
  groups.map(({ label: group, links }) =>
    links.length ? (
      <NavGroup isOpen label={group} key={group}>
        {links.map((item) => {
          const label = (
            <>
              {item.isActive ? <div className="nav__link-indicator" /> : null}
              <span className="nav__link-label">{item.label}</span>
            </>
          );
          return item.onClick ? (
            <Link
              className="nav__link"
              aria-disabled={item.disabled || undefined}
              href={item.href}
              id={item.id}
              key={item.id}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                event.preventDefault();
                if (!item.disabled) item.onClick?.();
              }}
              prefetch={false}
            >
              {label}
            </Link>
          ) : item.isCurrentPage ? (
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
    ) : null,
  );

/**
 * @file src/app/(system-admin)/layout.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Создаёт независимый корневой layout системной админки без стилей Payload.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { PropsWithChildren } from "react";
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

export const metadata: Metadata = {
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
};

export default function SystemAdminLayout({ children }: PropsWithChildren) {
  return (
    <html
      className={[GeistSans.variable, GeistMono.variable].join(" ")}
      lang="ru"
    >
      <body style={{ margin: 0, minWidth: 320 }}>{children}</body>
    </html>
  );
}

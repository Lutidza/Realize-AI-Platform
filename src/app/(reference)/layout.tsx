/**
 * @file src/app/(reference)/layout.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Применяет фиксированный пакет Realize к самостоятельным reference routes.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { ReactNode } from "react";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { systemAdminReferenceAppearance } from "@/components/admin/system-shell/systemAdminReferenceAppearance.config";

import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

type ReferenceLayoutProps = {
  children: ReactNode;
};

export default function ReferenceLayout({ children }: ReferenceLayoutProps) {
  return (
    <html
      className={[GeistSans.variable, GeistMono.variable].join(" ")}
      lang="ru"
    >
      <head>
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body style={{ margin: 0, minWidth: 320 }}>
        <SystemAdminTemplateProvider {...systemAdminReferenceAppearance}>
          {children}
        </SystemAdminTemplateProvider>
      </body>
    </html>
  );
}

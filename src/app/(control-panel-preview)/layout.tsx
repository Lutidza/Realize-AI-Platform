/**
 * @file src/app/(control-panel-preview)/layout.tsx
 * @version 1.0.0
 * @date 2026-11-11
 * @description Изолирует публичный preview нового каркаса от legacy и Payload оформления.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

/** Самостоятельный document не подключает Payload CSS или legacy reference provider. */
export default function ControlPanelPreviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="ru"
      className={[GeistSans.variable, GeistMono.variable].join(" ")}
    >
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}

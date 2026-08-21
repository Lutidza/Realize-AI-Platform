/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIClient.tsx
 * @version 2026-08-18
 * @description Exposes the full-page view backed by the global Admin AI provider.
 */

"use client";

import { RealizeAIWorkspace } from "./RealizeAIWorkspace";

/** Renders the larger project-assistant workspace at the dedicated Admin route. */
export const RealizeAIClient = () => <RealizeAIWorkspace variant="page" />;

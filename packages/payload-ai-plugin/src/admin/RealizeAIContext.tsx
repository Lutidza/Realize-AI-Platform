/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIContext.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Предоставляет единый controller чата всему дереву Payload Admin.
 */

"use client";

import { createContext } from "react";
import type { RealizeAIController } from "./RealizeAIController.types";
export type { RealizeAIController } from "./RealizeAIController.types";
export { useRealizeAIController } from "./useRealizeAIController.hook";

export const RealizeAIContext = createContext<RealizeAIController | null>(null);

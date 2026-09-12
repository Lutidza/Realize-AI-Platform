/**
 * @file packages/payload-ai-plugin/src/admin/useRealizeAIController.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Читает controller установленного общего провайдера чата.
 */

"use client";

import { useContext } from "react";
import { RealizeAIContext } from "./RealizeAIContext";
import type { RealizeAIController } from "./RealizeAIController.types";

/** Ошибка композиции не создаёт второй независимый controller. */
export const useRealizeAIController = (): RealizeAIController => {
  const controller = useContext(RealizeAIContext);
  if (!controller)
    throw new Error("Realize AI Admin provider is not installed.");
  return controller;
};

/**
 * @file packages/payload-ai-plugin/src/admin/useRunPolling.ts
 * @version 2026-08-18
 * @description Polls the durable Admin run projection until it reaches terminal state.
 */

"use client";

import type { RunDTO } from "@realize/ai-contracts";
import { useEffect } from "react";

import { requestRealizeAI } from "./realizeAIAPI";

const POLL_INTERVAL_MS = 2_000;

type UseRunPollingOptions = {
  onError: (cause: unknown) => void;
  onRun: (run: RunDTO) => boolean;
  runID?: string;
};

/** Uses the persisted run DTO as a fallback when browser SSE misses termination. */
export const useRunPolling = ({
  onError,
  onRun,
  runID,
}: UseRunPollingOptions): void => {
  useEffect(() => {
    if (!runID) return;

    let disposed = false;
    let pollInFlight = false;
    let shouldContinue = true;
    let timer: number | undefined;

    const poll = async () => {
      if (pollInFlight || disposed) return;
      pollInFlight = true;
      try {
        const nextRun = await requestRealizeAI<RunDTO>(`/runs/${runID}`);
        if (disposed) return;
        shouldContinue = onRun(nextRun);
      } catch (cause) {
        if (!disposed) onError(cause);
      } finally {
        pollInFlight = false;
        if (!disposed && shouldContinue) {
          timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    void poll();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [onError, onRun, runID]);
};

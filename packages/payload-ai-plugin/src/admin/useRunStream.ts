/**
 * @file packages/payload-ai-plugin/src/admin/useRunStream.ts
 * @version 2026-08-18
 * @description Reconciles resumable SSE output with durable run polling for Admin chat.
 */

"use client";

import type {
  AIStreamEvent,
  RunDTO,
  RunStatus,
  UsageSummary,
} from "@realize/ai-contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { REALIZE_AI_API_ROOT } from "./realizeAIAPI";
import {
  isActiveRun,
  type RunStreamPhase,
  type RunStreamState,
} from "./runStreamTypes";
import { useRunPolling } from "./useRunPolling";

const streamEventTypes: AIStreamEvent["type"][] = [
  "assistant.completed",
  "assistant.delta",
  "run.cancelled",
  "run.failed",
  "run.started",
  "tool.completed",
  "tool.started",
  "usage.updated",
];

type UseRunStreamOptions = {
  onRunUpdate: (run: RunDTO) => void;
  onTerminal: (run: RunDTO) => Promise<void>;
  run?: RunDTO;
};

const errorMessage = (cause: unknown, fallback: string): string =>
  cause instanceof Error ? cause.message : fallback;

/** Maintains SSE output while polling the durable run as a terminal fallback. */
export const useRunStream = ({
  onRunUpdate,
  onTerminal,
  run,
}: UseRunStreamOptions): RunStreamState => {
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [issue, setIssue] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<RunStreamPhase>("idle");
  const [streamingMessage, setStreamingMessage] = useState("");
  const [toolSummary, setToolSummary] = useState<string>();
  const [usage, setUsage] = useState<UsageSummary>();
  const onRunUpdateRef = useRef(onRunUpdate);
  const onTerminalRef = useRef(onTerminal);
  const previousRunIDRef = useRef<string | undefined>(undefined);
  const runRef = useRef<RunDTO | undefined>(run);
  const sourceRef = useRef<EventSource | null>(null);
  const lastSequenceRef = useRef(0);
  const streamingMessageRef = useRef("");
  const terminalSyncRef = useRef<Promise<void> | null>(null);
  const activeRunID = isActiveRun(run) ? run.id : undefined;
  const runID = run?.id;

  useEffect(() => {
    onRunUpdateRef.current = onRunUpdate;
    onTerminalRef.current = onTerminal;
    runRef.current = run;
  }, [onRunUpdate, onTerminal, run]);

  useEffect(() => {
    if (previousRunIDRef.current === runID) return;

    previousRunIDRef.current = runID;
    sourceRef.current?.close();
    sourceRef.current = null;
    lastSequenceRef.current = 0;
    streamingMessageRef.current = "";
    terminalSyncRef.current = null;
    setIssue(undefined);
    setNow(Date.now());
    setPhase(runRef.current ? "connecting" : "idle");
    setStreamingMessage("");
    setToolSummary(undefined);
    setUsage(runRef.current?.usage);
  }, [runID]);

  useEffect(() => {
    if (!runID) return;

    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(timer);
  }, [runID]);

  const finalizeRun = useCallback((terminalRun: RunDTO) => {
    if (terminalSyncRef.current) return;

    runRef.current = terminalRun;
    onRunUpdateRef.current(terminalRun);
    sourceRef.current?.close();
    sourceRef.current = null;
    setIssue(undefined);
    setPhase("finalizing");

    const synchronization = (async () => {
      try {
        await onTerminalRef.current(terminalRun);
      } catch (cause) {
        setIssue(
          errorMessage(
            cause,
            "Ответ завершён, но историю пока не удалось обновить.",
          ),
        );
        setPhase("sync-error");
      } finally {
        terminalSyncRef.current = null;
      }
    })();
    terminalSyncRef.current = synchronization;
  }, []);

  const publishRun = useCallback((nextRun: RunDTO) => {
    runRef.current = nextRun;
    setUsage(nextRun.usage);
    onRunUpdateRef.current(nextRun);
  }, []);

  useEffect(() => {
    if (!activeRunID) return;

    const source = new EventSource(
      `${REALIZE_AI_API_ROOT}/runs/${activeRunID}/events`,
    );
    sourceRef.current?.close();
    sourceRef.current = source;

    source.onopen = () => {
      setIssue(undefined);
      setPhase(streamingMessageRef.current ? "streaming" : "waiting");
    };

    const finishFromEvent = (
      event: AIStreamEvent,
      status: Extract<RunStatus, "cancelled" | "completed" | "failed">,
    ) => {
      const current = runRef.current;
      if (!current || current.id !== event.runID) return;
      const summary =
        status === "failed"
          ? String(event.payload.message || "Запуск завершился с ошибкой.")
          : current.errorSummary;
      finalizeRun({
        ...current,
        errorSummary: summary,
        finishedAt: event.createdAt,
        status,
        updatedAt: event.createdAt,
      });
    };

    const onEvent = (raw: Event) => {
      try {
        const event = JSON.parse(
          (raw as MessageEvent<string>).data,
        ) as AIStreamEvent;
        if (event.runID !== activeRunID) return;
        if (event.sequence <= lastSequenceRef.current) return;
        lastSequenceRef.current = event.sequence;

        if (
          event.type === "assistant.delta" &&
          typeof event.payload.delta === "string"
        ) {
          streamingMessageRef.current += event.payload.delta;
          setStreamingMessage(streamingMessageRef.current);
          setIssue(undefined);
          setPhase("streaming");
        } else if (event.type === "assistant.completed") {
          finishFromEvent(event, "completed");
        } else if (event.type === "run.started") {
          const current = runRef.current;
          if (!current) return;
          publishRun({
            ...current,
            startedAt: current.startedAt || event.createdAt,
            status: "running",
            updatedAt: event.createdAt,
          });
          setPhase(streamingMessageRef.current ? "streaming" : "waiting");
        } else if (
          event.type === "tool.started" ||
          event.type === "tool.completed"
        ) {
          setToolSummary(String(event.payload.summary || "Чтение проекта"));
          setPhase(streamingMessageRef.current ? "streaming" : "waiting");
        } else if (event.type === "usage.updated") {
          setUsage(event.payload.usage as UsageSummary);
        } else if (event.type === "run.failed") {
          finishFromEvent(event, "failed");
        } else if (event.type === "run.cancelled") {
          finishFromEvent(event, "cancelled");
        }
      } catch {
        setIssue(
          "Получено некорректное событие. Проверяем сохранённое состояние запуска.",
        );
      }
    };

    for (const type of streamEventTypes) source.addEventListener(type, onEvent);
    source.onerror = () => {
      if (!isActiveRun(runRef.current)) return;
      setIssue(
        "Поток ответа прерван. Соединение восстанавливается, состояние запуска проверяется отдельно.",
      );
      setPhase("reconnecting");
    };

    return () => {
      for (const type of streamEventTypes)
        source.removeEventListener(type, onEvent);
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
    };
  }, [activeRunID, connectionRevision, finalizeRun, publishRun]);

  const handlePolledRun = useCallback(
    (nextRun: RunDTO): boolean => {
      publishRun(nextRun);
      if (!isActiveRun(nextRun)) {
        finalizeRun(nextRun);
        return false;
      }
      setPhase((current) =>
        current === "streaming" || current === "reconnecting"
          ? current
          : "waiting",
      );
      return true;
    },
    [finalizeRun, publishRun],
  );

  const handlePollingError = useCallback((cause: unknown) => {
    if (sourceRef.current?.readyState === EventSource.OPEN) return;
    setIssue(
      errorMessage(
        cause,
        "Не удалось проверить сохранённое состояние запуска.",
      ),
    );
    setPhase("reconnecting");
  }, []);

  useRunPolling({
    onError: handlePollingError,
    onRun: handlePolledRun,
    runID: activeRunID,
  });

  const retry = useCallback(() => {
    const current = runRef.current;
    if (!current) return;
    setIssue(undefined);
    if (isActiveRun(current)) {
      setPhase("connecting");
      setConnectionRevision((value) => value + 1);
    } else {
      finalizeRun(current);
    }
  }, [finalizeRun]);

  const startedAt = run
    ? Date.parse(run.startedAt || run.createdAt)
    : Number.NaN;
  const elapsedSeconds = Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((now - startedAt) / 1_000))
    : 0;

  return {
    elapsedSeconds,
    issue,
    phase,
    retry,
    streamingMessage,
    toolSummary,
    usage,
  };
};

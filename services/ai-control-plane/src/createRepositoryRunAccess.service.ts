/**
 * @file services/ai-control-plane/src/createRepositoryRunAccess.service.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Собирает единый read-only MCP доступ к actual worktree для execution/reviewer с диагностикой их run.
 */
import type {
  CodexRepositorySearchSettings,
  SearchObservation,
} from "@realize/ai-contracts";
import { createRepositoryChatTools } from "./repositoryChatTools.adapter";
import { createRepositoryReadPolicy } from "./repositoryReadPolicy.validator";
import { createRepositoryMcpBridge } from "./createRepositoryMcpBridge.service";
import { LocalSearchObservationCollector } from "./LocalSearchObservationCollector.service";
import type { SearchObservationCollectorStore } from "@realize/payload-ai-control/server/search-observability";
export async function createRepositoryRunAccess(input: {
  root: string;
  runID: string;
  consumer: "execution" | "review";
  search: CodexRepositorySearchSettings;
  signal: AbortSignal;
  observe?: (event: SearchObservation) => void;
  observationStore?: SearchObservationCollectorStore;
  handoffRoot?: string;
}) {
  if (!input.search.enabled) return undefined;
  const tools = createRepositoryChatTools({
    policy: await createRepositoryReadPolicy(
      input.root,
      input.search.developerInstructions,
    ),
    run: { id: input.runID, cancelRequested: false },
    consumer: input.consumer,
    signal: input.signal,
    responseBytes: 32 * 1024,
    observe: input.observe,
  });
  const bridge = await createRepositoryMcpBridge(
    tools,
    input.runID,
    input.signal,
  );
  const local = input.observationStore
    ? new LocalSearchObservationCollector(
        input.root,
        input.observationStore,
        () => {},
        {
          consumer: input.consumer,
          runID: input.runID,
          handoffRoot: input.handoffRoot,
        },
      )
    : undefined;
  let closed = false;
  return {
    ...bridge,
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        await bridge.close();
      } finally {
        await local?.close();
      }
    },
  };
}

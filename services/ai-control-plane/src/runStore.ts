/**
 * @file services/ai-control-plane/src/runStore.ts
 * @version 1.4.0
 * @date 2026-09-13
 * @description Хранит runtime runs и повторяемые события с проверкой полного запроса.
 */

import { randomUUID } from "node:crypto";

import type {
  ChatAssetReference,
  ProjectFileReference,
  AIStreamEvent,
  AIStreamEventType,
  AIChatConfigurationSnapshot,
  WorkflowCheckpoint,
  PageDraftContextDTO,
  PageDiscoveryGrant,
} from "@realize/ai-contracts";

/** Internal mutable run state owned by the loopback development service. */
export type ControlPlaneRun = {
  /** Private callback capability: never include in prompt, events or publicRun. */
  pageDiscovery?: PageDiscoveryGrant;
  pageDraftContext?: PageDraftContextDTO;
  agentConfiguration?: AIChatConfigurationSnapshot;
  workflow?: WorkflowCheckpoint;
  conversationHistory?: string;
  cancelRequested: boolean;
  events: AIStreamEvent[];
  id: string;
  model?: string;
  prompt: string;
  attachments?: ChatAssetReference[];
  projectFiles?: ProjectFileReference[];
  webSearch?: boolean;
  status: "cancelled" | "completed" | "failed" | "queued" | "running";
  threadID?: string;
};

type Subscriber = (event: AIStreamEvent) => void;

/** In-memory run registry with ordered replay and subscriber notification. */
export class RunStore {
  private readonly runs = new Map<string, ControlPlaneRun>();
  private readonly fingerprints = new Map<string, string>();
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  append(
    runID: string,
    type: AIStreamEventType,
    payload: Record<string, unknown>,
    visibility: AIStreamEvent["visibility"] = "user-visible",
  ): AIStreamEvent {
    const run = this.require(runID);
    const sequence = run.events.length + 1;
    const event: AIStreamEvent = {
      createdAt: new Date().toISOString(),
      id: `${runID}-${sequence}-${randomUUID()}`,
      payload,
      runID,
      sequence,
      type,
      visibility,
    };
    run.events.push(event);
    for (const subscriber of this.subscribers.get(runID) || [])
      subscriber(event);
    return event;
  }

  create(
    input: Omit<ControlPlaneRun, "cancelRequested" | "events" | "status">,
  ): ControlPlaneRun {
    const fingerprint = JSON.stringify(input);
    if (this.runs.has(input.id)) {
      if (this.fingerprints.get(input.id) !== fingerprint)
        throw new Error("Run ID is already bound to a different request.");
      return this.require(input.id);
    }
    this.fingerprints.set(input.id, fingerprint);
    const run: ControlPlaneRun = {
      ...input,
      cancelRequested: false,
      events: [],
      status: "queued",
    };
    this.runs.set(run.id, run);
    return run;
  }

  get(runID: string): ControlPlaneRun | undefined {
    return this.runs.get(runID);
  }

  getEvents(runID: string, afterSequence: number): AIStreamEvent[] {
    return this.require(runID).events.filter(
      (event) => event.sequence > afterSequence,
    );
  }

  require(runID: string): ControlPlaneRun {
    const run = this.runs.get(runID);
    if (!run) throw new Error("Run not found.");
    return run;
  }

  subscribe(runID: string, subscriber: Subscriber): () => void {
    this.require(runID);
    const subscribers = this.subscribers.get(runID) || new Set<Subscriber>();
    subscribers.add(subscriber);
    this.subscribers.set(runID, subscribers);

    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) this.subscribers.delete(runID);
    };
  }
}

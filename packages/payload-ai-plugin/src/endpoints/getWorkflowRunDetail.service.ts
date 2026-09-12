/**
 * @file packages/payload-ai-plugin/src/endpoints/getWorkflowRunDetail.service.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Собирает полную owned историю процесса и актуальные DataOperation без активной конфигурации или dispatch.
 */

import type { WorkflowRunDetailDTO } from "@realize/ai-contracts";
import {
  canonicalizeJSON,
  parseAIChatConfigurationSnapshot,
  parseWorkflowCheckpoint,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { WorkflowRunRegistryRepository } from "./WorkflowRunRegistry.repository";
import { DataOperationRepository } from "./dataOperationRepository";
import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import { projectDataOperation } from "./dataOperationProjection";
import { relationID } from "./mappers";
import { EndpointError } from "./http";
import { toWorkflowRunDetail } from "./toWorkflowRunDetail.mapper";
import type { WorkflowProjectionSegment } from "./WorkflowRunProjection.types";

const conflict = (): never => {
  throw new EndpointError(
    "CONFLICT",
    "Сохранённая история процесса не прошла проверку целостности.",
    409,
  );
};

/** GET никогда не разрешает текущий active pointer, не перепроверяет capability действием и не вызывает модель. */
export const getWorkflowRunDetail = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  userID: number | string,
  rootRunID: string,
): Promise<WorkflowRunDetailDTO> => {
  const chain = await new WorkflowRunRegistryRepository(req).getOwnedChain(
    rootRunID,
    userID,
  );
  const segments: WorkflowProjectionSegment[] = chain.runs.map((run) => {
    if (
      !run.turnContext ||
      typeof run.turnContext !== "object" ||
      !("agentConfiguration" in run.turnContext) ||
      !("workflow" in run.turnContext)
    )
      return conflict();
    try {
      const configuration = parseAIChatConfigurationSnapshot(
        run.turnContext.agentConfiguration,
      );
      const checkpoint = parseWorkflowCheckpoint(
        configuration,
        run.turnContext.workflow,
      );
      return { run, configuration, checkpoint };
    } catch {
      return conflict();
    }
  });
  const first = segments[0];
  const latest = segments.at(-1);
  if (!first || !latest) return conflict();
  const snapshot = canonicalizeJSON(first.configuration);
  const originalInput = canonicalizeJSON(first.checkpoint.input);
  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index];
    if (
      canonicalizeJSON(current.configuration) !== snapshot ||
      canonicalizeJSON(current.checkpoint.input) !== originalInput ||
      current.checkpoint.workflowKey !== first.checkpoint.workflowKey
    )
      return conflict();
    const previous = segments[index - 1];
    if (
      previous &&
      (previous.run.status !== "completed" ||
        !["ready", "awaiting_input"].includes(previous.checkpoint.phase) ||
        current.checkpoint.version <= previous.checkpoint.version ||
        Object.entries(previous.checkpoint.outputs).some(
          ([key, output]) =>
            !Object.hasOwn(current.checkpoint.outputs, key) ||
            canonicalizeJSON(current.checkpoint.outputs[key]) !==
              canonicalizeJSON(output),
        ))
    )
      return conflict();
  }
  const operations = new DataOperationRepository(req.payload, req);
  const audits = new DataOperationAuditRepository(req.payload, req);
  const source = first.run.turnContext as Record<string, unknown>;
  const receipts = Object.entries(latest.checkpoint.outputs).flatMap(
    ([stepKey, value]) => {
      const workflow = latest.configuration.compiled.selectedArtifacts.find(
        ({ artifact }) =>
          artifact.kind === "workflow_definition" &&
          artifact.key === latest.checkpoint.workflowKey,
      )?.artifact;
      if (
        workflow?.kind !== "workflow_definition" ||
        workflow.steps.find((step) => step.key === stepKey)?.type !==
          "capability"
      )
        return [];
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !("dataOperationID" in value) ||
        typeof value.dataOperationID !== "string" ||
        !("operationHash" in value)
      )
        return conflict();
      return [
        { stepKey, id: value.dataOperationID, hash: value.operationHash },
      ];
    },
  );
  const projected = await Promise.all(
    receipts.map(async (receipt) => {
      const operation = await operations.getOwnedOperation(receipt.id, userID);
      if (
        relationID(operation.conversation) !== String(chain.conversation.id) ||
        relationID(operation.requestedBy) !== String(userID) ||
        operation.operationHash !== receipt.hash ||
        relationID(operation.sourceMessage) !==
          String(source.workflowSourceMessageID)
      )
        return conflict();
      const event = await audits.getPreviewEvent(receipt.id);
      const provenance =
        event?.payload &&
        typeof event.payload === "object" &&
        "workflow" in event.payload
          ? event.payload.workflow
          : undefined;
      if (
        !provenance ||
        typeof provenance !== "object" ||
        !("type" in provenance) ||
        provenance.type !== "workflow" ||
        !("rootRunID" in provenance) ||
        provenance.rootRunID !== rootRunID ||
        !("stepKey" in provenance) ||
        provenance.stepKey !== receipt.stepKey ||
        !("compiledContextHash" in provenance) ||
        provenance.compiledContextHash !==
          latest.configuration.compiled.compiledContextHash
      )
        return conflict();
      return await projectDataOperation({
        operation,
        payload: req.payload,
        req,
      });
    }),
  );
  const [canManageData, canManageConfiguration] = await Promise.all([
    options.access.canManageData({ req }),
    options.access.canManageAIConfiguration({ req }),
  ]);
  return toWorkflowRunDetail({
    conversation: chain.conversation,
    segments,
    dataOperations: new Map(
      projected.map((operation) => [operation.id, operation]),
    ),
    permissions: {
      canManageData: Boolean(canManageData),
      canManageConfiguration: Boolean(canManageConfiguration),
    },
    enabled: options.enabled,
  });
};

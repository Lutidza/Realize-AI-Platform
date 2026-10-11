/**
 * @file services/ai-control-plane/src/parseChatRun.validator.ts
 * @version 2.0.0
 * @date 2026-10-04
 * @description Проверяет серверный запрос turn без браузерных путей к изображениям.
 */
import {
  CHAT_ATTACHMENT_LIMITS,
  parseCreateMessageInput,
  parsePageDraftContext,
  parsePageDiscoveryGrant,
} from "@realize/ai-contracts";
import type { ChatAssetReference } from "@realize/ai-contracts";
import type { ControlPlaneRun } from "./runStore";
import {
  assertRuntimeAIConfiguration,
  requireSystemAIRelease,
  parseWorkflowCheckpoint,
} from "@realize/change-engine";

export const parseChatRun = (
  body: Record<string, unknown>,
): Omit<ControlPlaneRun, "cancelRequested" | "events" | "status"> => {
  if (
    Object.keys(body).some(
      (key) =>
        ![
          "runID",
          "prompt",
          "model",
          "threadID",
          "attachments",
          "projectFiles",
          "webSearch",
          "agentConfiguration",
          "systemRelease",
          "conversationHistory",
          "workflow",
          "pageDraftContext",
          "pageDiscovery",
          "repositoryAccess",
        ].includes(key),
    )
  )
    throw new Error("Unknown run option.");
  if (
    typeof body.runID !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(body.runID)
  )
    throw new Error("runID is invalid.");
  const attachments = body.attachments ?? [];
  if (
    !Array.isArray(attachments) ||
    attachments.length > CHAT_ATTACHMENT_LIMITS.maxFiles
  )
    throw new Error("Invalid attachments.");
  const references: ChatAssetReference[] = attachments.map((value) => {
    if (
      !value ||
      typeof value !== "object" ||
      Object.keys(value).some((key) => !["id", "sha256"].includes(key)) ||
      typeof value.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(value.id) ||
      typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sha256)
    )
      throw new Error("Invalid attachment reference.");
    return { id: value.id, sha256: value.sha256 };
  });
  const input = parseCreateMessageInput({
    content: body.prompt,
    attachmentIDs: references.map((value) => value.id),
    projectFiles: body.projectFiles,
    webSearch: body.webSearch,
  });
  if (
    body.model !== undefined &&
    (typeof body.model !== "string" || body.model.length > 128)
  )
    throw new Error("model is invalid.");
  if (
    body.threadID !== undefined &&
    (typeof body.threadID !== "string" || body.threadID.length > 128)
  )
    throw new Error("threadID is invalid.");
  if (
    body.conversationHistory !== undefined &&
    (typeof body.conversationHistory !== "string" ||
      Buffer.byteLength(body.conversationHistory, "utf8") > 32 * 1024)
  )
    throw new Error("Conversation history is too large or invalid.");
  const system = requireSystemAIRelease(body.systemRelease);
  const systemRelease = {
    releaseID: system.releaseID,
    manifestHash: system.manifestHash,
  };
  const agentConfiguration = assertRuntimeAIConfiguration(
    systemRelease,
    body.agentConfiguration,
  );
  const workflow =
    body.workflow === undefined
      ? undefined
      : (() => {
          if (!agentConfiguration)
            throw new Error("Workflow requires a configuration snapshot.");
          const checkpoint = parseWorkflowCheckpoint(
            agentConfiguration,
            body.workflow,
          );
          if (checkpoint.phase !== "running")
            throw new Error(
              "Only an agent step can be dispatched to the provider.",
            );
          return checkpoint;
        })();
  if (workflow && body.pageDraftContext !== undefined)
    throw new Error("Workflow does not accept a selected page context.");
  if (workflow && body.pageDiscovery !== undefined)
    throw new Error("Workflow does not accept page discovery tools.");
  const access = body.repositoryAccess;
  if (
    access !== undefined &&
    (!access ||
      typeof access !== "object" ||
      Array.isArray(access) ||
      Object.keys(access).length !== 1 ||
      !("developerInstructions" in access) ||
      typeof access.developerInstructions !== "boolean")
  )
    throw new Error("Invalid repository access.");
  return {
    systemRelease,
    ...(access === undefined
      ? {}
      : {
          repositoryAccess: {
            developerInstructions: (
              access as { developerInstructions: boolean }
            ).developerInstructions,
          },
        }),
    ...(body.pageDiscovery === undefined
      ? {}
      : {
          pageDiscovery: parsePageDiscoveryGrant(
            body.pageDiscovery,
            body.runID,
          ),
        }),
    ...(body.pageDraftContext === undefined
      ? {}
      : {
          pageDraftContext: parsePageDraftContext(body.pageDraftContext),
        }),
    ...(workflow ? { workflow } : {}),
    ...(body.agentConfiguration !== undefined
      ? {
          agentConfiguration,
        }
      : {}),
    ...(body.conversationHistory !== undefined
      ? { conversationHistory: body.conversationHistory as string }
      : {}),
    id: body.runID,
    prompt: input.content,
    model: body.model as string | undefined,
    threadID: body.threadID as string | undefined,
    attachments: references,
    projectFiles: input.projectFiles ?? [],
    webSearch: input.webSearch ?? false,
  };
};

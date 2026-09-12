// @vitest-environment node
/**
 * @file tests/int/chatAttachmentRecovery.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет компенсацию загрузки и восстановление привязки строго по владельцу run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import { ChatAttachmentRepository } from "../../packages/payload-ai-plugin/src/chat-context/ChatAttachment.repository";
import { resolveOwnedChatAttachment } from "../../packages/payload-ai-plugin/src/chat-context/resolveOwnedChatAttachment.service";
import { uploadChatAttachment } from "../../packages/payload-ai-plugin/src/chat-context/uploadChatAttachment.service";
import { AIRepository } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { ControlPlaneClient } from "../../packages/payload-ai-plugin/src/runtime/controlPlaneClient";

const req = {
  payload: { db: { defaultIDType: "number" }, logger: { error: vi.fn() } },
} as unknown as PayloadRequest;
const document = {
  id: 7,
  assetID: "b0ab501b-5539-48fd-a79d-85d36c4326de",
  createdBy: 1,
  name: "a.txt",
  mimeType: "text/plain",
  size: 1,
  kind: "text" as const,
  sha256: "a".repeat(64),
  expiresAt: "2027-01-01",
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(
    ChatAttachmentRepository.prototype,
    "requireOwned",
  ).mockResolvedValue({ ...document });
  vi.spyOn(ChatAttachmentRepository.prototype, "link").mockResolvedValue(
    undefined,
  );
});

describe("attachment recovery", () => {
  it("reconciles a claim after DB link failure only through the same owner's saved run context", async () => {
    const client = {
      chatAssetMetadata: vi.fn().mockResolvedValue({ runID: "9" }),
    } as unknown as ControlPlaneClient;
    vi.spyOn(AIRepository.prototype, "getRun").mockResolvedValue({
      id: 9,
      turnContext: { attachments: [{ ...document, id: "7", url: "unused" }] },
    });
    expect(await resolveOwnedChatAttachment(req, client, "7", 1)).toMatchObject(
      { runID: "9" },
    );
    expect(AIRepository.prototype.getRun).toHaveBeenCalledWith("9", 1);
    expect(ChatAttachmentRepository.prototype.link).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      "9",
    );
  });
  it("does not repair when the run context references another file", async () => {
    const client = {
      chatAssetMetadata: vi.fn().mockResolvedValue({ runID: "9" }),
    } as unknown as ControlPlaneClient;
    vi.spyOn(AIRepository.prototype, "getRun").mockResolvedValue({
      id: 9,
      turnContext: { attachments: [] },
    });
    await expect(
      resolveOwnedChatAttachment(req, client, "7", 1),
    ).rejects.toMatchObject({ status: 409 });
    expect(ChatAttachmentRepository.prototype.link).not.toHaveBeenCalled();
  });
  it("checks ownership before contacting private storage", async () => {
    const client = {
      chatAssetMetadata: vi.fn(),
    } as unknown as ControlPlaneClient;
    vi.mocked(
      ChatAttachmentRepository.prototype.requireOwned,
    ).mockRejectedValue(new Error("foreign"));
    await expect(
      resolveOwnedChatAttachment(req, client, "7", 2),
    ).rejects.toThrow("foreign");
    expect(client.chatAssetMetadata).not.toHaveBeenCalled();
  });
  it("removes the binary upload when metadata creation fails", async () => {
    const client = {
      uploadChatAsset: vi.fn().mockResolvedValue({ id: document.assetID }),
      deleteChatAsset: vi.fn().mockResolvedValue(undefined),
    } as unknown as ControlPlaneClient;
    vi.spyOn(ChatAttachmentRepository.prototype, "create").mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(
      uploadChatAttachment(req, client, new File(["a"], "a.txt"), 1),
    ).rejects.toThrow("database unavailable");
    expect(client.deleteChatAsset).toHaveBeenCalledWith(document.assetID);
  });
});

/**
 * @file tests/int/ai-contracts.int.spec.ts
 * @version 2026-08-21
 * @description Verifies browser, site and control-plane contract boundaries.
 */

import {
  ContractValidationError,
  encodeSSE,
  parseAcceptPreviewInput,
  parseAcceptImplementationInput,
  parseApprovePlanInput,
  parseCreateChangeRequestInput,
  parseCreateConversationInput,
  parseCreateMessageInput,
  parseDeployPreviewInput,
  parseExecuteChangeInput,
  parseIdentifier,
  parseRejectPlanInput,
  parseRejectImplementationInput,
  parseRejectPreviewInput,
} from "@realize/ai-contracts";
import { describe, expect, it } from "vitest";

describe("Realize AI contracts", () => {
  it("normalizes valid public input", () => {
    expect(parseCreateConversationInput({ title: "  Architecture  " })).toEqual(
      { title: "Architecture" },
    );
    expect(
      parseCreateMessageInput({ content: "  Explain the catalog  " }),
    ).toEqual({ content: "Explain the catalog" });
    expect(parseIdentifier("run_123-abc", "runID")).toBe("run_123-abc");
    expect(
      parseCreateChangeRequestInput({ sourceMessageID: "message_42" }),
    ).toEqual({ sourceMessageID: "message_42" });
    expect(parseApprovePlanInput({ expectedVersion: 2 })).toEqual({
      comment: undefined,
      expectedVersion: 2,
    });
    expect(
      parseRejectPlanInput({
        comment: "Нужно сузить scope",
        expectedVersion: 2,
      }),
    ).toEqual({ comment: "Нужно сузить scope", expectedVersion: 2 });
    expect(parseExecuteChangeInput({ expectedVersion: 3 })).toEqual({
      expectedVersion: 3,
    });
    expect(
      parseAcceptImplementationInput({
        expectedDiffHash: "a".repeat(64),
        expectedVersion: 7,
      }),
    ).toEqual({
      comment: undefined,
      expectedDiffHash: "a".repeat(64),
      expectedVersion: 7,
    });
    expect(
      parseDeployPreviewInput({
        expectedDiffHash: "b".repeat(64),
        expectedVersion: 8,
      }),
    ).toEqual({
      expectedDiffHash: "b".repeat(64),
      expectedVersion: 8,
    });
    expect(
      parseAcceptPreviewInput({
        expectedArtifactHash: "c".repeat(64),
        expectedVersion: 15,
      }),
    ).toEqual({
      comment: undefined,
      expectedArtifactHash: "c".repeat(64),
      expectedVersion: 15,
    });
  });

  it("rejects invalid and oversized input", () => {
    expect(() => parseCreateConversationInput([])).toThrow(
      ContractValidationError,
    );
    expect(() => parseCreateMessageInput({ content: " ".repeat(2) })).toThrow(
      "content must contain between 1 and 8000 characters.",
    );
    expect(() => parseIdentifier("../../secret", "runID")).toThrow(
      "runID is invalid.",
    );
    expect(() => parseApprovePlanInput({ expectedVersion: 0 })).toThrow(
      "expectedVersion must be a positive integer.",
    );
    expect(() =>
      parseRejectPlanInput({ comment: " ", expectedVersion: 1 }),
    ).toThrow("comment must contain between 3 and 1000 characters.");
    expect(() =>
      parseRejectImplementationInput({
        comment: "Нет",
        expectedDiffHash: "not-a-hash",
        expectedVersion: 3,
      }),
    ).toThrow("expectedDiffHash must be a SHA-256 hash.");
    expect(() =>
      parseRejectPreviewInput({
        comment: "Нет",
        expectedArtifactHash: "invalid",
        expectedVersion: 15,
      }),
    ).toThrow("expectedArtifactHash must be a SHA-256 hash.");
  });

  it("encodes an ordered resumable SSE frame", () => {
    const event = {
      createdAt: "2026-08-17T00:00:00.000Z",
      id: "run-1-1",
      payload: { delta: "Привет" },
      runID: "run-1",
      sequence: 1,
      type: "assistant.delta" as const,
      visibility: "user-visible" as const,
    };

    expect(encodeSSE(event)).toBe(
      `id: run-1-1\nevent: assistant.delta\ndata: ${JSON.stringify(event)}\n\n`,
    );
  });
});

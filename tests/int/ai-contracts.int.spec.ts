/**
 * @file tests/int/ai-contracts.int.spec.ts
 * @version 2026-08-28
 * @description Проверяет browser, source/release и integration API contracts.
 */

import {
  ContractValidationError,
  encodeSSE,
  parseAcceptPreviewInput,
  parseAcceptImplementationInput,
  parseApplyDataOperationInput,
  parseAssignProductCategoryIntent,
  parseApprovePlanInput,
  parseApproveReleaseInput,
  parseCreateChangeRequestInput,
  parseCreateConversationInput,
  parseCreateDataOperationInput,
  parseCreateMessageInput,
  parseDeployPreviewInput,
  parseDataRollbackInput,
  parseDecideDataOperationInput,
  parseDisconnectIntegrationInput,
  parseExecuteChangeInput,
  parseGitHubRepositoryURL,
  parseIdentifier,
  parseRejectPlanInput,
  parseRejectImplementationInput,
  parseRejectPreviewInput,
  parsePrepareReleaseInput,
  parsePublishPullRequestInput,
  parseRejectReleaseInput,
  parseSaveGitHubIntegrationInput,
  parseTestGitHubIntegrationInput,
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
    expect(
      parsePrepareReleaseInput({
        expectedPreviewArtifactHash: "d".repeat(64),
        expectedVersion: 16,
      }),
    ).toEqual({
      expectedPreviewArtifactHash: "d".repeat(64),
      expectedVersion: 16,
    });
    expect(
      parseApproveReleaseInput({
        expectedImageDigest: `sha256:${"e".repeat(64)}`,
        expectedManifestHash: "f".repeat(64),
        expectedMigrationSetHash: "1".repeat(64),
        expectedVersion: 18,
      }),
    ).toEqual({
      expectedImageDigest: `sha256:${"e".repeat(64)}`,
      expectedManifestHash: "f".repeat(64),
      expectedMigrationSetHash: "1".repeat(64),
      expectedVersion: 18,
    });
    expect(
      parsePublishPullRequestInput({
        expectedGitCommit: "2".repeat(40),
        expectedPreviewArtifactHash: "3".repeat(64),
        expectedVersion: 17,
      }),
    ).toEqual({
      expectedGitCommit: "2".repeat(40),
      expectedPreviewArtifactHash: "3".repeat(64),
      expectedVersion: 17,
    });
    expect(
      parseSaveGitHubIntegrationInput({
        enabled: true,
        expectedRevision: 0,
        repositoryURL: "https://www.github.com/Realize/store.git",
        token: "integration-token-12345678901234567890",
      }),
    ).toEqual({
      enabled: true,
      expectedRevision: 0,
      repositoryURL: "https://github.com/Realize/store",
      token: "integration-token-12345678901234567890",
    });
    expect(
      parseTestGitHubIntegrationInput({
        repositoryURL: "https://github.com/Realize/store",
      }),
    ).toEqual({ repositoryURL: "https://github.com/Realize/store" });
    expect(parseDisconnectIntegrationInput({ expectedRevision: 2 })).toEqual({
      expectedRevision: 2,
    });
    expect(
      parseAssignProductCategoryIntent({
        category: { slug: "accessories" },
        kind: "catalog.assignCategory.v1",
        product: { id: "42" },
        version: "1.0",
      }),
    ).toEqual({
      category: { slug: "accessories" },
      kind: "catalog.assignCategory.v1",
      product: { id: "42" },
      version: "1.0",
    });
    expect(
      parseCreateDataOperationInput({ sourceMessageID: "message_84" }),
    ).toEqual({ sourceMessageID: "message_84" });
    expect(
      parseDecideDataOperationInput({
        expectedOperationHash: "4".repeat(64),
        expectedVersion: 1,
      }),
    ).toEqual({
      expectedOperationHash: "4".repeat(64),
      expectedVersion: 1,
    });
    expect(
      parseApplyDataOperationInput({
        expectedOperationHash: "5".repeat(64),
        expectedVersion: 2,
      }),
    ).toEqual({
      expectedOperationHash: "5".repeat(64),
      expectedVersion: 2,
    });
    expect(
      parseDataRollbackInput({
        expectedRollbackHash: "6".repeat(64),
        expectedVersion: 4,
      }),
    ).toEqual({
      expectedRollbackHash: "6".repeat(64),
      expectedVersion: 4,
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
    expect(() =>
      parseApproveReleaseInput({
        expectedImageDigest: "latest",
        expectedManifestHash: "a".repeat(64),
        expectedMigrationSetHash: "b".repeat(64),
        expectedVersion: 18,
      }),
    ).toThrow("expectedImageDigest must be an OCI SHA-256 digest.");
    expect(() =>
      parseRejectReleaseInput({
        comment: "Не",
        expectedImageDigest: `sha256:${"a".repeat(64)}`,
        expectedManifestHash: "b".repeat(64),
        expectedMigrationSetHash: "c".repeat(64),
        expectedVersion: 18,
      }),
    ).toThrow("comment must contain between 3 and 1000 characters.");
    expect(() =>
      parsePublishPullRequestInput({
        expectedGitCommit: "short",
        expectedPreviewArtifactHash: "a".repeat(64),
        expectedVersion: 17,
      }),
    ).toThrow("expectedGitCommit must be a full Git commit SHA.");
    expect(() =>
      parseGitHubRepositoryURL("https://gitlab.com/realize/store"),
    ).toThrow("repositoryURL must be a valid GitHub HTTPS URL.");
    expect(() =>
      parseGitHubRepositoryURL("https://token@github.com/realize/store"),
    ).toThrow("repositoryURL must be a valid GitHub HTTPS URL.");
    expect(() =>
      parseSaveGitHubIntegrationInput({
        enabled: true,
        expectedRevision: 0,
        repositoryURL: "https://github.com/realize/store",
        token: "short",
      }),
    ).toThrow("token format is invalid.");
    expect(() =>
      parseAssignProductCategoryIntent({
        category: { slug: "accessories", title: "Accessories" },
        kind: "catalog.assignCategory.v1",
        product: { id: "42" },
        version: "1.0",
      }),
    ).toThrow("category selector must contain exactly one");
    expect(() =>
      parseAssignProductCategoryIntent({
        category: { slug: "accessories" },
        kind: "payload.update",
        product: { id: "42" },
        version: "1.0",
      }),
    ).toThrow("data operation kind is not supported");
    expect(() =>
      parseDecideDataOperationInput(
        {
          comment: " ",
          expectedOperationHash: "a".repeat(64),
          expectedVersion: 1,
        },
        true,
      ),
    ).toThrow("comment must contain between 3 and 1000 characters");
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

/**
 * @file packages/ai-contracts/src/validation.ts
 * @version 2026-08-21
 * @description Validates untrusted input at the public API boundary without runtime dependencies.
 */

import type {
  ApprovePlanInput,
  CreateChangeRequestInput,
  CreateConversationInput,
  CreateMessageInput,
  RejectPlanInput,
} from "./api";
import type {
  AcceptImplementationInput,
  ExecuteChangeInput,
  RejectImplementationInput,
} from "./execution";
import type {
  AcceptPreviewInput,
  DeployPreviewInput,
  RejectPreviewInput,
} from "./preview";

/** Expected validation failure safe to translate into an API error. */
export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractValidationError("Request body must be a JSON object.");
  }

  return value as Record<string, unknown>;
};

/** Validates and normalizes a conversation-create body. */
export const parseCreateConversationInput = (
  value: unknown,
): CreateConversationInput => {
  const input = asObject(value);

  if (input.title === undefined) return {};
  if (typeof input.title !== "string") {
    throw new ContractValidationError("title must be a string.");
  }

  const title = input.title.trim();
  if (title.length === 0 || title.length > 120) {
    throw new ContractValidationError(
      "title must contain between 1 and 120 characters.",
    );
  }

  return { title };
};

/** Validates, trims and bounds a user message body. */
export const parseCreateMessageInput = (value: unknown): CreateMessageInput => {
  const input = asObject(value);

  if (typeof input.content !== "string") {
    throw new ContractValidationError("content must be a string.");
  }

  const content = input.content.trim();
  if (content.length === 0 || content.length > 8_000) {
    throw new ContractValidationError(
      "content must contain between 1 and 8000 characters.",
    );
  }

  return { content };
};

/** Validates the assistant message selected as the immutable plan source. */
export const parseCreateChangeRequestInput = (
  value: unknown,
): CreateChangeRequestInput => {
  const input = asObject(value);
  return {
    sourceMessageID: parseIdentifier(
      input.sourceMessageID,
      "source message id",
    ),
  };
};

const parseExpectedVersion = (value: unknown): number => {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ContractValidationError(
      "expectedVersion must be a positive integer.",
    );
  }
  return Number(value);
};

const parseSHA256 = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ContractValidationError(`${name} must be a SHA-256 hash.`);
  }
  return value;
};

const parseComment = (
  value: unknown,
  required: boolean,
): string | undefined => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") {
    throw new ContractValidationError("comment must be a string.");
  }
  const comment = value.trim();
  const minimum = required ? 3 : 0;
  if (comment.length < minimum || comment.length > 1_000) {
    throw new ContractValidationError(
      required
        ? "comment must contain between 3 and 1000 characters."
        : "comment must not exceed 1000 characters.",
    );
  }
  return comment || undefined;
};

/** Validates an approval and its optimistic-lock version. */
export const parseApprovePlanInput = (value: unknown): ApprovePlanInput => {
  const input = asObject(value);
  return {
    comment: parseComment(input.comment, false),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates a rejection; an auditable reason is mandatory. */
export const parseRejectPlanInput = (value: unknown): RejectPlanInput => {
  const input = asObject(value);
  const comment = parseComment(input.comment, true);
  if (!comment) {
    throw new ContractValidationError(
      "comment must contain between 3 and 1000 characters.",
    );
  }
  return {
    comment,
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates a request to queue one approved plan version. */
export const parseExecuteChangeInput = (value: unknown): ExecuteChangeInput => {
  const input = asObject(value);
  return { expectedVersion: parseExpectedVersion(input.expectedVersion) };
};

/** Validates acceptance of one exact produced diff. */
export const parseAcceptImplementationInput = (
  value: unknown,
): AcceptImplementationInput => {
  const input = asObject(value);
  return {
    comment: parseComment(input.comment, false),
    expectedDiffHash: parseSHA256(input.expectedDiffHash, "expectedDiffHash"),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates rejection of one exact produced diff. */
export const parseRejectImplementationInput = (
  value: unknown,
): RejectImplementationInput => {
  const input = asObject(value);
  const comment = parseComment(input.comment, true);
  if (!comment) {
    throw new ContractValidationError(
      "comment must contain between 3 and 1000 characters.",
    );
  }
  return {
    comment,
    expectedDiffHash: parseSHA256(input.expectedDiffHash, "expectedDiffHash"),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates promotion of one exact human-accepted diff. */
export const parseDeployPreviewInput = (value: unknown): DeployPreviewInput => {
  const input = asObject(value);
  return {
    expectedDiffHash: parseSHA256(input.expectedDiffHash, "expectedDiffHash"),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates acceptance of one exact preview artifact. */
export const parseAcceptPreviewInput = (value: unknown): AcceptPreviewInput => {
  const input = asObject(value);
  return {
    comment: parseComment(input.comment, false),
    expectedArtifactHash: parseSHA256(
      input.expectedArtifactHash,
      "expectedArtifactHash",
    ),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates preview rejection and its mandatory audit comment. */
export const parseRejectPreviewInput = (value: unknown): RejectPreviewInput => {
  const input = asObject(value);
  const comment = parseComment(input.comment, true);
  if (!comment) {
    throw new ContractValidationError(
      "comment must contain between 3 and 1000 characters.",
    );
  }
  return {
    comment,
    expectedArtifactHash: parseSHA256(
      input.expectedArtifactHash,
      "expectedArtifactHash",
    ),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates route identifiers before they reach Payload queries. */
export const parseIdentifier = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new ContractValidationError(`${name} is invalid.`);
  }

  return value;
};

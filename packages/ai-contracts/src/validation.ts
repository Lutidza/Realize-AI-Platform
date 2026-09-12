/**
 * @file packages/ai-contracts/src/validation.ts
 * @version 1.2.0
 * @date 2026-09-09
 * @description Проверяет недоверенный ввод на public API boundary без runtime-зависимостей.
 */

import { parseChatMessageContext } from "./parseChatMessageContext.validator";

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
  DisconnectIntegrationInput,
  SaveGitHubIntegrationInput,
  TestGitHubIntegrationInput,
} from "./integrations";
import type {
  AcceptPreviewInput,
  DeployPreviewInput,
  RejectPreviewInput,
} from "./preview";
import type {
  ApproveReleaseInput,
  PrepareReleaseInput,
  RejectReleaseInput,
} from "./release";
import type { PublishPullRequestInput } from "./sourcePromotion";
import { parseGitIntegrationTransport } from "./parseGitHubIntegrationConfiguration.validator";
import { parseGitCommitAuthor } from "./parseGitCommitAuthor.validator";

/** Ожидаемая ошибка проверки, безопасная для ответа API. */
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

/** Проверяет и нормализует запрос создания диалога. */
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

/** Проверяет текст сообщения, удаляет внешние пробелы и ограничивает длину. */
export const parseCreateMessageInput = (value: unknown): CreateMessageInput => {
  const input = asObject(value);

  if (typeof input.content !== "string") {
    throw new ContractValidationError("content must be a string.");
  }

  const content = input.content.trim();
  const context = parseChatMessageContext(input);
  if (
    (content.length === 0 &&
      !context.attachmentIDs?.length &&
      !context.projectFiles?.length) ||
    content.length > 8_000
  ) {
    throw new ContractValidationError(
      "content must contain between 1 and 8000 characters.",
    );
  }

  return { content, ...context };
};

/** Проверяет сообщение ассистента, выбранное неизменяемым источником плана. */
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

const parseExpectedRevision = (value: unknown, allowZero: boolean): number => {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(value) || Number(value) < minimum) {
    throw new ContractValidationError(
      `expectedRevision must be an integer >= ${minimum}.`,
    );
  }
  return Number(value);
};

const parseGitHubToken = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new ContractValidationError("token must be a string.");
  }
  const token = value.trim();
  if (
    token.length < 20 ||
    token.length > 512 ||
    /\s/.test(token) ||
    /[\u0000-\u001f\u007f]/.test(token)
  ) {
    throw new ContractValidationError("token format is invalid.");
  }
  return token;
};

/** Нормализует HTTPS-адрес репозитория GitHub без сохранения credentials. */
export const parseGitHubRepositoryURL = (
  value: unknown,
): { repositorySlug: string; repositoryURL: string } => {
  if (typeof value !== "string" || value.length > 2_000) {
    throw new ContractValidationError("repositoryURL must be a string.");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ContractValidationError(
      "repositoryURL must be a valid GitHub HTTPS URL.",
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (hostname !== "github.com" && hostname !== "www.github.com") ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new ContractValidationError(
      "repositoryURL must be a valid GitHub HTTPS URL.",
    );
  }
  let segments: string[];
  try {
    segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    throw new ContractValidationError(
      "repositoryURL contains an invalid owner or repository name.",
    );
  }
  if (segments.length !== 2) {
    throw new ContractValidationError(
      "repositoryURL must identify one GitHub repository.",
    );
  }
  const owner = segments[0];
  const repository = segments[1].replace(/\.git$/i, "");
  const segmentPattern = /^[A-Za-z0-9_.-]{1,100}$/;
  if (!segmentPattern.test(owner) || !segmentPattern.test(repository)) {
    throw new ContractValidationError(
      "repositoryURL contains an invalid owner or repository name.",
    );
  }
  const repositorySlug = `${owner}/${repository}`;
  return {
    repositorySlug,
    repositoryURL: `https://github.com/${repositorySlug}`,
  };
};

const optionalDisplayName = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ContractValidationError("displayName must be a string.");
  }
  const displayName = value.trim();
  if (displayName.length < 1 || displayName.length > 80) {
    throw new ContractValidationError(
      "displayName must contain between 1 and 80 characters.",
    );
  }
  return displayName;
};

/** Проверяет сохранение GitHub: token необязателен при обновлении, null удаляет автора. */
export const parseSaveGitHubIntegrationInput = (
  value: unknown,
): SaveGitHubIntegrationInput => {
  const input = asObject(value);
  if (typeof input.enabled !== "boolean") {
    throw new ContractValidationError("enabled must be a boolean.");
  }
  const repository = parseGitHubRepositoryURL(input.repositoryURL);
  // Не подставляем HTTPS во вход обновления: старый клиент не должен сбрасывать SSH.
  const transport =
    input.transport === undefined
      ? undefined
      : parseGitIntegrationTransport(input);
  if (input.transport === undefined && input.sshProfileRef !== undefined) {
    throw new ContractValidationError(
      "sshProfileRef requires an explicit SSH transport.",
    );
  }
  return {
    displayName: optionalDisplayName(input.displayName),
    enabled: input.enabled,
    expectedRevision: parseExpectedRevision(input.expectedRevision, true),
    repositoryURL: repository.repositoryURL,
    ...transport,
    ...(input.commitAuthor === undefined
      ? {}
      : {
          commitAuthor:
            input.commitAuthor === null
              ? null
              : parseGitCommitAuthor(input.commitAuthor),
        }),
    ...(input.token === undefined
      ? {}
      : { token: parseGitHubToken(input.token) }),
  };
};

/** Проверяет необязательные черновые значения для GitHub-проверки без сохранения. */
export const parseTestGitHubIntegrationInput = (
  value: unknown,
): TestGitHubIntegrationInput => {
  const input = asObject(value);
  return {
    ...(input.repositoryURL === undefined
      ? {}
      : {
          repositoryURL: parseGitHubRepositoryURL(input.repositoryURL)
            .repositoryURL,
        }),
    ...(input.token === undefined
      ? {}
      : { token: parseGitHubToken(input.token) }),
  };
};

/** Проверяет запрос удаления интеграции с optimistic revision. */
export const parseDisconnectIntegrationInput = (
  value: unknown,
): DisconnectIntegrationInput => {
  const input = asObject(value);
  return {
    expectedRevision: parseExpectedRevision(input.expectedRevision, false),
  };
};

const parseSHA256 = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ContractValidationError(`${name} must be a SHA-256 hash.`);
  }
  return value;
};

const parseGitCommit = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    throw new ContractValidationError(`${name} must be a full Git commit SHA.`);
  }
  return value;
};

const parseOCIDigest = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new ContractValidationError(`${name} must be an OCI SHA-256 digest.`);
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

/** Проверяет подтверждение и версию optimistic lock. */
export const parseApprovePlanInput = (value: unknown): ApprovePlanInput => {
  const input = asObject(value);
  return {
    comment: parseComment(input.comment, false),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Проверяет отклонение с обязательной причиной для аудита. */
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

/** Проверяет запрос постановки утверждённой версии плана в очередь. */
export const parseExecuteChangeInput = (value: unknown): ExecuteChangeInput => {
  const input = asObject(value);
  return { expectedVersion: parseExpectedVersion(input.expectedVersion) };
};

/** Проверяет принятие конкретного полученного diff. */
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

/** Проверяет отклонение конкретного полученного diff. */
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

/** Проверяет продвижение конкретного diff, принятого пользователем. */
export const parseDeployPreviewInput = (value: unknown): DeployPreviewInput => {
  const input = asObject(value);
  return {
    expectedDiffHash: parseSHA256(input.expectedDiffHash, "expectedDiffHash"),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Проверяет принятие конкретного preview artifact. */
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

/** Проверяет отклонение preview с обязательным комментарием для аудита. */
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

/** Проверяет публикацию exact accepted preview commit в Pull Request. */
export const parsePublishPullRequestInput = (
  value: unknown,
): PublishPullRequestInput => {
  const input = asObject(value);
  return {
    expectedGitCommit: parseGitCommit(
      input.expectedGitCommit,
      "expectedGitCommit",
    ),
    expectedPreviewArtifactHash: parseSHA256(
      input.expectedPreviewArtifactHash,
      "expectedPreviewArtifactHash",
    ),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Проверяет запрос на подготовку OCI-кандидата из exact preview artifact. */
export const parsePrepareReleaseInput = (
  value: unknown,
): PrepareReleaseInput => {
  const input = asObject(value);
  return {
    expectedPreviewArtifactHash: parseSHA256(
      input.expectedPreviewArtifactHash,
      "expectedPreviewArtifactHash",
    ),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

const parseReleaseDecision = (
  value: unknown,
  commentRequired: boolean,
): ApproveReleaseInput | RejectReleaseInput => {
  const input = asObject(value);
  const comment = parseComment(input.comment, commentRequired);
  if (commentRequired && !comment) {
    throw new ContractValidationError(
      "comment must contain between 3 and 1000 characters.",
    );
  }
  return {
    ...(comment ? { comment } : {}),
    expectedImageDigest: parseOCIDigest(
      input.expectedImageDigest,
      "expectedImageDigest",
    ),
    expectedManifestHash: parseSHA256(
      input.expectedManifestHash,
      "expectedManifestHash",
    ),
    expectedMigrationSetHash: parseSHA256(
      input.expectedMigrationSetHash,
      "expectedMigrationSetHash",
    ),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  } as ApproveReleaseInput | RejectReleaseInput;
};

/** Проверяет принятие exact OCI-кандидата. */
export const parseApproveReleaseInput = (value: unknown): ApproveReleaseInput =>
  parseReleaseDecision(value, false) as ApproveReleaseInput;

/** Проверяет отклонение OCI-кандидата с обязательной причиной. */
export const parseRejectReleaseInput = (value: unknown): RejectReleaseInput =>
  parseReleaseDecision(value, true) as RejectReleaseInput;

/** Проверяет идентификаторы маршрута до передачи в запросы Payload. */
export const parseIdentifier = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new ContractValidationError(`${name} is invalid.`);
  }

  return value;
};

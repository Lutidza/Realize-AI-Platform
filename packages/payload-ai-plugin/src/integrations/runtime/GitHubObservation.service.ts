/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitHubObservation.service.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Наблюдает коммит и associated PR только в актуальном серверном подключении GitHub.
 * @see documentation/specifications/task-management-execution.md
 */
import { parseGitHubRepositoryURL } from "@realize/ai-contracts";
import {
  awaitGitHubObservation,
  GitHubObservationAdapter,
} from "./GitHubObservation.adapter";
import { GitHubObservationError } from "./GitHubObservation.error";
import type {
  GitHubObservationInput,
  GitHubObservationOptions,
  GitHubObservationResult,
} from "./GitHubObservation.types";
import type { GitHubConnectionResolver } from "./IntegrationRuntime.types";
import { mapGitHubObservation } from "./mapGitHubObservation.mapper";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;

/** Live чтение не изменяет Git, подключение или task binding и не сохраняет durable evidence. */
export class GitHubObservationService {
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(
    private readonly connections: GitHubConnectionResolver,
    options: GitHubObservationOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > DEFAULT_TIMEOUT_MS ||
      !Number.isSafeInteger(this.maxResponseBytes) ||
      this.maxResponseBytes < 1 ||
      this.maxResponseBytes > MAX_RESPONSE_BYTES
    )
      throw new Error("GitHub observation limits are invalid.");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  /** Общий deadline включает resolver, пять HTTP чтений, потоки и повторную проверку revision. */
  async observe(
    input: GitHubObservationInput,
  ): Promise<GitHubObservationResult> {
    const commitSha = input?.commitSha;
    const repositoryId = input?.repositoryId;
    if (typeof commitSha !== "string" || !/^[a-f0-9]{40}$/.test(commitSha))
      return { status: "unavailable", reason: "unsupported_sha" };
    if (typeof repositoryId !== "string")
      return { status: "unavailable", reason: "repository_not_allowed" };
    const binding = { repositoryId, commitSha };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resolved = await awaitGitHubObservation(
        this.connections.resolvePrimaryGitHub(),
        controller.signal,
      );
      if (resolved.state !== "ready")
        return { status: "unavailable", reason: "not_configured" };
      // Снимок защищает binding, даже если dependency переиспользует изменяемую запись.
      const connection = {
        repositorySlug: resolved.repositorySlug,
        revision: resolved.revision,
        token: resolved.token,
      };
      const repository = parseGitHubRepositoryURL(
        `https://github.com/${connection.repositorySlug}`,
      );
      if (
        repository.repositorySlug !== connection.repositorySlug ||
        repositoryId !== connection.repositorySlug
      )
        return { status: "unavailable", reason: "repository_not_allowed" };
      const responses = await new GitHubObservationAdapter({
        fetchImplementation: this.fetchImplementation,
        maxResponseBytes: this.maxResponseBytes,
        token: connection.token,
        signal: controller.signal,
      }).read(binding);
      const result = mapGitHubObservation({ ...binding, ...responses });
      const current = await awaitGitHubObservation(
        this.connections.resolvePrimaryGitHub(),
        controller.signal,
      );
      if (
        current.state !== "ready" ||
        current.repositorySlug !== connection.repositorySlug ||
        current.revision !== connection.revision ||
        current.token !== connection.token
      )
        return { status: "unavailable", reason: "provider_unavailable" };
      return result;
    } catch (error) {
      return {
        status: "unavailable",
        reason:
          error instanceof GitHubObservationError
            ? error.reason
            : "provider_unavailable",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

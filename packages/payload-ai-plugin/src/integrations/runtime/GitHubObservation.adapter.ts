/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitHubObservation.adapter.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Читает фиксированные GitHub REST endpoints с общим deadline и потоковым лимитом ответа.
 * @see documentation/specifications/task-management-execution.md
 */
import { GitHubObservationError } from "./GitHubObservation.error";
import type {
  GitHubObservationCiHttpResult,
  GitHubObservationHttpOptions,
  GitHubObservationHttpResponse,
  GitHubObservationHttpResult,
  GitHubObservationInput,
} from "./GitHubObservation.types";

/** Ограничивает также зависимости, не обрабатывающие AbortSignal самостоятельно. */
export function awaitGitHubObservation<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener("abort", aborted);
      reject(new GitHubObservationError("provider_unavailable"));
    };
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}

/** Raw JSON остаётся внутри integration owner; credential передаётся только в HTTP header. */
export class GitHubObservationAdapter {
  constructor(private readonly options: GitHubObservationHttpOptions) {}

  async read(
    input: GitHubObservationInput,
  ): Promise<GitHubObservationHttpResult> {
    const [owner, repository] = input.repositoryId.split("/");
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    const repositoryResponse = await this.request(endpoint);
    const commitResponse = await this.request(
      `${endpoint}/commits/${input.commitSha}`,
    );
    const pullRequestsResponse = await this.request(
      `${endpoint}/commits/${input.commitSha}/pulls?per_page=20&page=1`,
    );
    const [checkRuns, commitStatuses] = await Promise.all([
      this.readCi(
        `${endpoint}/commits/${input.commitSha}/check-runs?filter=all&per_page=20&page=1`,
      ),
      this.readCi(
        `${endpoint}/commits/${input.commitSha}/status?per_page=20&page=1`,
      ),
    ]);
    return {
      repository: repositoryResponse.value,
      commit: commitResponse.value,
      pullRequests: pullRequestsResponse.value,
      pullRequestsLink: pullRequestsResponse.link,
      checkRuns,
      commitStatuses,
    };
  }

  private async readCi(url: string): Promise<GitHubObservationCiHttpResult> {
    try {
      return { status: "received", response: await this.request(url) };
    } catch (error) {
      return {
        status: "unavailable",
        reason:
          error instanceof GitHubObservationError
            ? error.reason
            : "provider_unavailable",
      };
    }
  }

  private async request(url: string): Promise<GitHubObservationHttpResponse> {
    const response = await awaitGitHubObservation(
      this.options.fetchImplementation(url, {
        method: "GET",
        redirect: "error",
        signal: this.options.signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.options.token}`,
          "User-Agent": "realize-github-observation",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
      this.options.signal,
    );
    if (!response.ok || response.redirected) {
      void response.body?.cancel().catch(() => undefined);
      throw new GitHubObservationError("provider_unavailable");
    }
    const length = response.headers.get("content-length");
    if (
      length &&
      /^\d+$/.test(length) &&
      Number(length) > this.options.maxResponseBytes
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new GitHubObservationError("invalid_response");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new GitHubObservationError("invalid_response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const read = await awaitGitHubObservation(
          reader.read(),
          this.options.signal,
        );
        if (read.done) break;
        size += read.value.byteLength;
        if (size > this.options.maxResponseBytes)
          throw new GitHubObservationError("invalid_response");
        chunks.push(read.value);
      }
      try {
        return {
          value: JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks),
            ),
          ),
          link: response.headers.get("link"),
        };
      } catch {
        throw new GitHubObservationError("invalid_response");
      }
    } finally {
      // Cleanup не может продлить deadline при зависшем transport или reader.cancel.
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

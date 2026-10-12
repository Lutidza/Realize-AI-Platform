/**
 * @file tests/int/github-observation.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Проверяет GitHub identity, bounded HTTP, безопасную проекцию и актуальность подключения без сети.
 * @see documentation/specifications/task-management-execution.md
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GitHubObservationService,
  type GitHubObservationOptions,
  type RuntimeGitHubIntegration,
} from "@realize/payload-ai-control/server/integration-runtime";

const repositoryId = "realize/store";
const commitSha = "a".repeat(40);
const credential = "observation-worker-only-credential";
const connection: RuntimeGitHubIntegration = {
  state: "ready",
  repositorySlug: repositoryId,
  revision: 3,
  token: credential,
};
const repository = {
  id: 123,
  full_name: "Realize/Store",
  html_url: "https://evil.invalid/repository",
  token: credential,
};
const commit = {
  sha: commitSha,
  html_url: "https://evil.invalid/commit",
  commit: { message: credential, author: { email: "private@invalid.test" } },
};
const pullRequest = {
  number: 7,
  state: "open",
  draft: true,
  merged_at: null,
  base: { repo: repository },
  head: { repo: { id: 456, full_name: "contributor/fork" } },
  html_url: "https://evil.invalid/pr",
  body: credential,
};
const checkRun = {
  id: 11,
  name: "Unit tests",
  head_sha: commitSha,
  status: "completed",
  conclusion: "success",
  url: `https://api.github.com/repos/${repositoryId}/check-runs/11`,
  html_url: "https://evil.invalid/run",
  details_url: "https://evil.invalid/build",
  output: { text: credential },
};
const checkRuns = { total_count: 1, check_runs: [checkRun] };
const commitStatus = {
  id: 12,
  context: "legacy/unit",
  state: "success",
  description: credential,
  target_url: "https://evil.invalid/status",
};
const commitStatuses = {
  sha: commitSha,
  repository,
  state: "success",
  total_count: 1,
  statuses: [commitStatus],
};

function fixture(
  bodies: unknown[] = [repository, commit, [pullRequest]],
  options: GitHubObservationOptions = {},
) {
  const resolvePrimaryGitHub = vi.fn().mockResolvedValue(connection);
  const fetchImplementation = vi.fn<typeof fetch>();
  const responses =
    bodies.length === 3 ? [...bodies, checkRuns, commitStatuses] : bodies;
  responses.forEach((body) =>
    fetchImplementation.mockResolvedValueOnce(Response.json(body)),
  );
  return {
    resolvePrimaryGitHub,
    fetchImplementation,
    service: new GitHubObservationService(
      { resolvePrimaryGitHub },
      { fetchImplementation, ...options },
    ),
  };
}
const input = { repositoryId, commitSha };

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("GitHub live observation", () => {
  it("выдаёт только безопасные поля exact commit и PR с fork head", async () => {
    const { service, fetchImplementation, resolvePrimaryGitHub } = fixture();
    const result = await service.observe(input);
    expect(result).toEqual({
      status: "observed",
      repository: {
        id: "123",
        fullName: repositoryId,
        url: `https://github.com/${repositoryId}`,
      },
      commit: {
        sha: commitSha,
        url: `https://github.com/${repositoryId}/commit/${commitSha}`,
      },
      pullRequests: [
        {
          number: 7,
          url: `https://github.com/${repositoryId}/pull/7`,
          state: "open",
          draft: true,
          merged: false,
        },
      ],
      pullRequestsComplete: true,
      ci: {
        checkRuns: {
          status: "observed",
          totalCount: 1,
          complete: true,
          items: [
            {
              id: "11",
              name: "Unit tests",
              headSha: commitSha,
              status: "completed",
              conclusion: "success",
              url: `https://github.com/${repositoryId}/runs/11`,
            },
          ],
        },
        commitStatuses: {
          status: "observed",
          totalCount: 1,
          complete: true,
          combinedState: "success",
          items: [{ id: "12", context: "legacy/unit", state: "success" }],
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(credential);
    expect(JSON.stringify(result)).not.toContain("private@invalid.test");
    expect(JSON.stringify(result)).not.toContain("evil.invalid");
    expect(resolvePrimaryGitHub).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls.map(([url]) => url)).toEqual([
      `https://api.github.com/repos/${repositoryId}`,
      `https://api.github.com/repos/${repositoryId}/commits/${commitSha}`,
      `https://api.github.com/repos/${repositoryId}/commits/${commitSha}/pulls?per_page=20&page=1`,
      `https://api.github.com/repos/${repositoryId}/commits/${commitSha}/check-runs?filter=all&per_page=20&page=1`,
      `https://api.github.com/repos/${repositoryId}/commits/${commitSha}/status?per_page=20&page=1`,
    ]);
    for (const [, options] of fetchImplementation.mock.calls) {
      expect(options).toMatchObject({
        method: "GET",
        redirect: "error",
        signal: expect.any(AbortSignal),
        headers: {
          Authorization: `Bearer ${credential}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    }
  });

  it.each(["absent", "disabled"] as const)(
    "подключение %s не вызывает HTTP",
    async (state) => {
      const { service, fetchImplementation, resolvePrimaryGitHub } = fixture();
      resolvePrimaryGitHub.mockResolvedValue({ state });
      await expect(service.observe(input)).resolves.toEqual({
        status: "unavailable",
        reason: "not_configured",
      });
      expect(fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it.each([
    "other/store",
    "https://github.com/realize/store",
    "github:primary",
    "Realize/Store",
  ])(
    "другой repository identity %s не вызывает HTTP",
    async (otherRepositoryId) => {
      const { service, fetchImplementation } = fixture();
      await expect(
        service.observe({ ...input, repositoryId: otherRepositoryId }),
      ).resolves.toEqual({
        status: "unavailable",
        reason: "repository_not_allowed",
      });
      expect(fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it.each(["a".repeat(64), "A".repeat(40), "abcdef", "../other"])(
    "не передаёт неподдерживаемый SHA %s в resolver или HTTP",
    async (sha) => {
      const { service, fetchImplementation, resolvePrimaryGitHub } = fixture();
      await expect(
        service.observe({ ...input, commitSha: sha }),
      ).resolves.toEqual({ status: "unavailable", reason: "unsupported_sha" });
      expect(resolvePrimaryGitHub).not.toHaveBeenCalled();
      expect(fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ ...repository, full_name: "other/store" }, commit, [pullRequest]],
    [{ ...repository, id: 0 }, commit, [pullRequest]],
    [repository, { ...commit, sha: "b".repeat(40) }, [pullRequest]],
    [
      repository,
      commit,
      [{ ...pullRequest, base: { repo: { ...repository, id: 999 } } }],
    ],
    [
      repository,
      commit,
      [
        {
          ...pullRequest,
          base: { repo: { ...repository, full_name: "other/store" } },
        },
      ],
    ],
    [repository, commit, [{ ...pullRequest, draft: "true" }]],
    [repository, commit, [{ ...pullRequest, merged_at: "invalid" }]],
    [
      repository,
      commit,
      [{ ...pullRequest, merged_at: "2026-10-12T12:00:00Z" }],
    ],
    [
      repository,
      commit,
      [{ ...pullRequest, state: "closed", merged_at: "2026-10-12T12:00:00Z" }],
    ],
    [repository, commit, [pullRequest, pullRequest]],
    [
      repository,
      commit,
      Array.from({ length: 21 }, (_, index) => ({
        ...pullRequest,
        number: index + 1,
      })),
    ],
    [repository, commit, {}],
  ])("отклоняет invalid provider identity/shape %#", async (...bodies) => {
    const { service } = fixture(bodies);
    await expect(service.observe(input)).resolves.toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
  });

  it("различает merged PR и закрытый без merge", async () => {
    const { service } = fixture([
      repository,
      commit,
      [
        {
          ...pullRequest,
          state: "closed",
          draft: false,
          merged_at: "2026-10-12T12:00:00Z",
        },
        { ...pullRequest, number: 8, state: "closed", draft: false },
      ],
    ]);
    const result = await service.observe(input);
    expect(result).toMatchObject({
      status: "observed",
      pullRequests: [
        { state: "closed", merged: true },
        { state: "closed", merged: false },
      ],
    });
  });

  it.each(["next", "prev next"])(
    "обозначает next page rel=%s и не следует provider Link",
    async (rel) => {
      const { service, fetchImplementation } = fixture([repository, commit]);
      fetchImplementation.mockResolvedValueOnce(
        Response.json([pullRequest], {
          headers: {
            Link: `<https://evil.invalid/page2>; rel="${rel}", <https://evil.invalid/page4>; rel="last"`,
          },
        }),
      );
      fetchImplementation.mockResolvedValueOnce(Response.json(checkRuns));
      fetchImplementation.mockResolvedValueOnce(Response.json(commitStatuses));
      await expect(service.observe(input)).resolves.toMatchObject({
        status: "observed",
        pullRequestsComplete: false,
      });
      expect(fetchImplementation).toHaveBeenCalledTimes(5);
    },
  );

  it.each([403, 404, 429, 500])(
    "HTTP %s возвращает безопасную недоступность, не отсутствие объекта",
    async (status) => {
      const { service, fetchImplementation } = fixture([]);
      fetchImplementation.mockResolvedValueOnce(
        new Response(credential, { status }),
      );
      await expect(service.observe(input)).resolves.toEqual({
        status: "unavailable",
        reason: "provider_unavailable",
      });
    },
  );

  it("не выдаёт credential из redirect/transport error", async () => {
    const { service, fetchImplementation } = fixture([]);
    fetchImplementation.mockRejectedValueOnce(
      new Error(`Redirect rejected: ${credential}`),
    );
    await expect(service.observe(input)).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
  });

  it("отклоняет успешный response после redirect", async () => {
    const { service, fetchImplementation } = fixture([]);
    const response = Response.json(repository);
    Object.defineProperty(response, "redirected", { value: true });
    fetchImplementation.mockResolvedValueOnce(response);
    await expect(service.observe(input)).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
  });

  it.each(["not JSON", "{"])("отклоняет malformed JSON %s", async (body) => {
    const { service, fetchImplementation } = fixture([]);
    fetchImplementation.mockResolvedValueOnce(new Response(body));
    await expect(service.observe(input)).resolves.toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
  });

  it("прерывает oversized stream до JSON.parse и следующего HTTP", async () => {
    const cancel = vi.fn();
    const { service, fetchImplementation } = fixture([], {
      maxResponseBytes: 32,
    });
    fetchImplementation.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(" ".repeat(33)));
          },
          cancel,
        }),
      ),
    );
    await expect(service.observe(input)).resolves.toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("проверяет заявленный content-length до чтения", async () => {
    const { service, fetchImplementation } = fixture([], {
      maxResponseBytes: 32,
    });
    fetchImplementation.mockResolvedValueOnce(
      new Response("{}", { headers: { "Content-Length": "33" } }),
    );
    await expect(service.observe(input)).resolves.toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
  });

  it("deadline ограничивает зависший resolver", async () => {
    vi.useFakeTimers();
    const { service, resolvePrimaryGitHub, fetchImplementation } = fixture([], {
      timeoutMs: 20,
    });
    resolvePrimaryGitHub.mockImplementation(() => new Promise(() => {}));
    const result = service.observe(input);
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("deadline общий для последовательных HTTP, даже когда dependency игнорирует signal", async () => {
    vi.useFakeTimers();
    const { service, fetchImplementation } = fixture([], { timeoutMs: 20 });
    const bodies = [repository, commit, [pullRequest]];
    let call = 0;
    fetchImplementation.mockImplementation(
      () =>
        new Promise((resolve) => {
          const body = bodies[call++];
          setTimeout(() => resolve(Response.json(body)), 8);
        }),
    );
    const result = service.observe(input);
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(fetchImplementation.mock.calls[2][1]?.signal?.aborted).toBe(true);
  });

  it("deadline охватывает зависший body и cleanup не ожидает зависший cancel", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const { service, fetchImplementation } = fixture([], { timeoutMs: 20 });
    fetchImplementation.mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel })),
    );
    const result = service.observe(input);
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    { ...connection, revision: 4 },
    { ...connection, token: `${credential}-rotated` },
    { ...connection, repositorySlug: "other/store" },
    { state: "disabled" },
  ])("не возвращает facts после изменения подключения %#", async (current) => {
    const { service, resolvePrimaryGitHub } = fixture();
    resolvePrimaryGitHub
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce(current);
    await expect(service.observe(input)).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
  });

  it("повторная проверка подключения также ограничена общим deadline", async () => {
    vi.useFakeTimers();
    const { service, resolvePrimaryGitHub } = fixture(undefined, {
      timeoutMs: 20,
    });
    resolvePrimaryGitHub
      .mockResolvedValueOnce(connection)
      .mockImplementationOnce(() => new Promise(() => {}));
    const result = service.observe(input);
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
  });

  it("не сохраняет внешнюю ошибку resolver или credential в результате", async () => {
    const { service, resolvePrimaryGitHub } = fixture();
    resolvePrimaryGitHub.mockRejectedValueOnce(new Error(credential));
    await expect(service.observe(input)).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
  });

  it.each([
    { timeoutMs: 10_001 },
    { maxResponseBytes: 1_000_001 },
    { timeoutMs: 0 },
    { maxResponseBytes: 0 },
  ])("не позволяет расширить или отключить bounds %#", (options) => {
    expect(() => fixture([], options)).toThrow(
      "GitHub observation limits are invalid.",
    );
  });

  it("сохраняет повторные check runs с одинаковым name и разными IDs", async () => {
    const repeatedRun = {
      ...checkRun,
      id: 13,
      url: `https://api.github.com/repos/${repositoryId}/check-runs/13`,
      status: "queued",
      conclusion: null,
    };
    const { service } = fixture([
      repository,
      commit,
      [pullRequest],
      { total_count: 2, check_runs: [checkRun, repeatedRun] },
      commitStatuses,
    ]);
    await expect(service.observe(input)).resolves.toMatchObject({
      status: "observed",
      ci: {
        checkRuns: {
          status: "observed",
          complete: true,
          items: [
            { id: "11", conclusion: "success" },
            { id: "13", status: "queued", conclusion: null },
          ],
        },
      },
    });
  });

  it.each(["queued", "in_progress", "waiting", "requested", "pending"])(
    "поддерживает незавершённый check status %s без заключения",
    async (status) => {
      const { service } = fixture([
        repository,
        commit,
        [pullRequest],
        {
          total_count: 1,
          check_runs: [{ ...checkRun, status, conclusion: null }],
        },
        commitStatuses,
      ]);
      await expect(service.observe(input)).resolves.toMatchObject({
        status: "observed",
        ci: {
          checkRuns: {
            status: "observed",
            items: [{ status, conclusion: null }],
          },
        },
      });
    },
  );

  it.each([
    "action_required",
    "cancelled",
    "failure",
    "neutral",
    "success",
    "skipped",
    "stale",
    "timed_out",
    "startup_failure",
  ])(
    "сохраняет provider conclusion %s без положительного общего verdict",
    async (conclusion) => {
      const { service } = fixture([
        repository,
        commit,
        [pullRequest],
        { total_count: 1, check_runs: [{ ...checkRun, conclusion }] },
        commitStatuses,
      ]);
      const result = await service.observe(input);
      expect(result).toMatchObject({
        status: "observed",
        ci: { checkRuns: { status: "observed", items: [{ conclusion }] } },
      });
      expect(JSON.stringify(result)).not.toContain('"passed"');
    },
  );

  it.each([
    { ...checkRuns, check_runs: [{ ...checkRun, head_sha: "b".repeat(40) }] },
    {
      ...checkRuns,
      check_runs: [
        {
          ...checkRun,
          url: "https://api.github.com/repos/other/store/check-runs/11",
        },
      ],
    },
    { ...checkRuns, check_runs: [{ ...checkRun, id: 0 }] },
    { ...checkRuns, check_runs: [{ ...checkRun, name: "\nprivate" }] },
    { ...checkRuns, check_runs: [{ ...checkRun, name: "x".repeat(256) }] },
    { ...checkRuns, check_runs: [{ ...checkRun, status: "unknown" }] },
    { ...checkRuns, check_runs: [{ ...checkRun, conclusion: "unknown" }] },
    { ...checkRuns, check_runs: [{ ...checkRun, conclusion: null }] },
    { ...checkRuns, check_runs: [{ ...checkRun, status: "in_progress" }] },
    { total_count: 2, check_runs: [checkRun, checkRun] },
    { ...checkRuns, total_count: 0 },
    { ...checkRuns, total_count: -1 },
    { ...checkRuns, total_count: "1" },
    {
      total_count: 21,
      check_runs: Array.from({ length: 21 }, (_, index) => ({
        ...checkRun,
        id: index + 1,
        url: `https://api.github.com/repos/${repositoryId}/check-runs/${index + 1}`,
      })),
    },
  ])(
    "не связывает неправильные check run факты с task SHA %#",
    async (badChecks) => {
      const { service } = fixture([
        repository,
        commit,
        [pullRequest],
        badChecks,
        commitStatuses,
      ]);
      await expect(service.observe(input)).resolves.toMatchObject({
        status: "observed",
        ci: {
          checkRuns: { status: "unavailable", reason: "invalid_response" },
          commitStatuses: { status: "observed" },
        },
      });
    },
  );

  it.each([
    { ...commitStatuses, sha: "b".repeat(40) },
    { ...commitStatuses, repository: { ...repository, id: 456 } },
    {
      ...commitStatuses,
      repository: { ...repository, full_name: "other/store" },
    },
    { ...commitStatuses, statuses: [{ ...commitStatus, id: 0 }] },
    {
      ...commitStatuses,
      statuses: [{ ...commitStatus, context: "x".repeat(256) }],
    },
    {
      ...commitStatuses,
      statuses: [{ ...commitStatus, context: "\nprivate" }],
    },
    { ...commitStatuses, statuses: [{ ...commitStatus, state: "unknown" }] },
    { ...commitStatuses, state: "error" },
    { ...commitStatuses, total_count: 0 },
    {
      ...commitStatuses,
      total_count: 2,
      statuses: [commitStatus, commitStatus],
    },
    {
      ...commitStatuses,
      total_count: 2,
      statuses: [
        commitStatus,
        { ...commitStatus, id: 13, context: "LEGACY/UNIT" },
      ],
    },
  ])(
    "legacy status identity/shape ошибка не подменяет check runs %#",
    async (badStatuses) => {
      const { service } = fixture([
        repository,
        commit,
        [pullRequest],
        checkRuns,
        badStatuses,
      ]);
      await expect(service.observe(input)).resolves.toMatchObject({
        status: "observed",
        ci: {
          checkRuns: { status: "observed" },
          commitStatuses: { status: "unavailable", reason: "invalid_response" },
        },
      });
    },
  );

  it.each([
    { ...commitStatuses, total_count: 0, statuses: [] },
    { ...commitStatuses, statuses: [{ ...commitStatus, state: "failure" }] },
    { ...commitStatuses, statuses: [{ ...commitStatus, state: "error" }] },
    { ...commitStatuses, statuses: [{ ...commitStatus, state: "pending" }] },
    { ...commitStatuses, state: "pending" },
  ])(
    "отклоняет противоречащий complete contexts legacy aggregate %#",
    async (badStatuses) => {
      const { service } = fixture([
        repository,
        commit,
        [pullRequest],
        checkRuns,
        badStatuses,
      ]);
      await expect(service.observe(input)).resolves.toMatchObject({
        status: "observed",
        ci: {
          commitStatuses: { status: "unavailable", reason: "invalid_response" },
        },
      });
    },
  );

  it("пустые checks и legacy contexts остаются пустыми, а не успешным CI", async () => {
    const { service } = fixture([
      repository,
      commit,
      [pullRequest],
      { total_count: 0, check_runs: [] },
      { ...commitStatuses, state: "pending", total_count: 0, statuses: [] },
    ]);
    await expect(service.observe(input)).resolves.toMatchObject({
      status: "observed",
      ci: {
        checkRuns: {
          status: "observed",
          items: [],
          totalCount: 0,
          complete: true,
        },
        commitStatuses: {
          status: "observed",
          items: [],
          totalCount: 0,
          complete: true,
          combinedState: "pending",
        },
      },
    });
  });

  it("partial legacy aggregate не выводится из единственного context страницы", async () => {
    const { service } = fixture([
      repository,
      commit,
      [pullRequest],
      checkRuns,
      { ...commitStatuses, total_count: 2, state: "failure" },
    ]);
    await expect(service.observe(input)).resolves.toMatchObject({
      status: "observed",
      ci: {
        commitStatuses: {
          status: "observed",
          totalCount: 2,
          complete: false,
          combinedState: "failure",
          items: [{ state: "success" }],
        },
      },
    });
  });

  it("Link next обозначает неполноту обоих CI channels, provider URL не читается", async () => {
    const { service, fetchImplementation } = fixture([]);
    for (const body of [repository, commit, [pullRequest]])
      fetchImplementation.mockResolvedValueOnce(Response.json(body));
    const headers = {
      Link: '<https://evil.invalid/ci?page=2>; rel="prev next"',
    };
    fetchImplementation.mockResolvedValueOnce(
      Response.json(checkRuns, { headers }),
    );
    fetchImplementation.mockResolvedValueOnce(
      Response.json(commitStatuses, { headers }),
    );
    await expect(service.observe(input)).resolves.toMatchObject({
      status: "observed",
      ci: {
        checkRuns: { status: "observed", complete: false },
        commitStatuses: { status: "observed", complete: false },
      },
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(5);
  });

  it.each([403, 404, 429, 500])(
    "CI HTTP %s не уничтожает repo/commit/PR и второй канал",
    async (status) => {
      const { service, fetchImplementation } = fixture([]);
      for (const body of [repository, commit, [pullRequest]])
        fetchImplementation.mockResolvedValueOnce(Response.json(body));
      fetchImplementation.mockResolvedValueOnce(
        new Response(credential, { status }),
      );
      fetchImplementation.mockResolvedValueOnce(Response.json(commitStatuses));
      await expect(service.observe(input)).resolves.toMatchObject({
        status: "observed",
        commit: { sha: commitSha },
        pullRequests: [{ number: 7 }],
        ci: {
          checkRuns: { status: "unavailable", reason: "provider_unavailable" },
          commitStatuses: { status: "observed" },
        },
      });
    },
  );

  it("оба CI permission failures сохраняются раздельно без ложного empty/success", async () => {
    const { service, fetchImplementation } = fixture([]);
    for (const body of [repository, commit, [pullRequest]])
      fetchImplementation.mockResolvedValueOnce(Response.json(body));
    fetchImplementation.mockResolvedValueOnce(
      new Response(credential, { status: 403 }),
    );
    fetchImplementation.mockResolvedValueOnce(
      new Response(credential, { status: 403 }),
    );
    const result = await service.observe(input);
    expect(result).toMatchObject({
      status: "observed",
      ci: {
        checkRuns: { status: "unavailable", reason: "provider_unavailable" },
        commitStatuses: {
          status: "unavailable",
          reason: "provider_unavailable",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(credential);
  });

  it("malformed JSON одного CI channel не отменяет другой", async () => {
    const { service, fetchImplementation } = fixture([]);
    for (const body of [repository, commit, [pullRequest]])
      fetchImplementation.mockResolvedValueOnce(Response.json(body));
    fetchImplementation.mockResolvedValueOnce(new Response("{"));
    fetchImplementation.mockResolvedValueOnce(Response.json(commitStatuses));
    await expect(service.observe(input)).resolves.toMatchObject({
      status: "observed",
      ci: {
        checkRuns: { status: "unavailable", reason: "invalid_response" },
        commitStatuses: { status: "observed" },
      },
    });
  });

  it("oversized CI stream отменяется отдельно и не отдаёт private output", async () => {
    const cancel = vi.fn();
    const { service, fetchImplementation } = fixture([]);
    for (const body of [repository, commit, [pullRequest]])
      fetchImplementation.mockResolvedValueOnce(Response.json(body));
    fetchImplementation.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1_000_001));
          },
          cancel,
        }),
      ),
    );
    fetchImplementation.mockResolvedValueOnce(Response.json(commitStatuses));
    await expect(service.observe(input)).resolves.toMatchObject({
      status: "observed",
      ci: {
        checkRuns: { status: "unavailable", reason: "invalid_response" },
        commitStatuses: { status: "observed" },
      },
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("deadline включает оба parallel CI calls и recheck не выдаёт устаревшие facts", async () => {
    vi.useFakeTimers();
    const { service, fetchImplementation } = fixture(
      [repository, commit, [pullRequest], checkRuns],
      { timeoutMs: 20 },
    );
    fetchImplementation.mockImplementationOnce(() => new Promise(() => {}));
    const result = service.observe(input);
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(5);
    expect(fetchImplementation.mock.calls[4][1]?.signal?.aborted).toBe(true);
  });
});

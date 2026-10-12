/**
 * @file packages/payload-task-manager/src/contracts/taskGitObservation.schemas.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Проверяет закрытый Git-снимок, его связь с сохранённым SHA и канонические публичные URL.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import {
  TASK_GIT_OBSERVATION_LIMIT,
  TASK_GIT_OBSERVATION_PULL_REQUEST_LIMIT,
  TASK_GIT_OBSERVATION_CI_LIMIT,
} from "./taskGitObservation.constants";
import {
  taskGitBindingSchema,
  taskPublicIdSchema,
} from "./taskManager.schemas";

const providerId = z
  .string()
  .regex(/^[1-9][0-9]{0,15}$/)
  .refine((value) => Number.isSafeInteger(Number(value)));
const safeLabel = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      value.trim().length > 0 &&
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      }),
  );
const totalCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ciUnavailable = z.strictObject({
  status: z.literal("unavailable"),
  reason: z.enum(["provider_unavailable", "invalid_response"]),
});
const checkRun = z
  .strictObject({
    id: providerId,
    name: safeLabel,
    headSha: z.string().regex(/^[a-f0-9]{40}$/),
    status: z.enum([
      "queued",
      "in_progress",
      "completed",
      "waiting",
      "requested",
      "pending",
    ]),
    conclusion: z
      .enum([
        "action_required",
        "cancelled",
        "failure",
        "neutral",
        "success",
        "skipped",
        "stale",
        "timed_out",
        "startup_failure",
      ])
      .nullable(),
    url: z.string().max(320),
  })
  .refine((run) =>
    run.status === "completed"
      ? run.conclusion !== null
      : run.conclusion === null,
  );
const commitStatus = z.strictObject({
  id: providerId,
  context: safeLabel,
  state: z.enum(["error", "failure", "pending", "success"]),
});
const checkRuns = z
  .strictObject({
    status: z.literal("observed"),
    items: z.array(checkRun).max(TASK_GIT_OBSERVATION_CI_LIMIT),
    totalCount,
    complete: z.boolean(),
  })
  .refine(
    (page) =>
      page.totalCount >= page.items.length &&
      (!page.complete || page.totalCount === page.items.length) &&
      new Set(page.items.map((item) => item.id)).size === page.items.length,
  );
const commitStatuses = z
  .strictObject({
    status: z.literal("observed"),
    items: z.array(commitStatus).max(TASK_GIT_OBSERVATION_CI_LIMIT),
    totalCount,
    complete: z.boolean(),
    combinedState: z.enum(["failure", "pending", "success"]),
  })
  .superRefine((page, ctx) => {
    if (
      page.totalCount < page.items.length ||
      (page.complete && page.totalCount !== page.items.length) ||
      new Set(page.items.map((item) => item.id)).size !== page.items.length ||
      new Set(page.items.map((item) => item.context.toLowerCase())).size !==
        page.items.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Некорректная страница commit statuses.",
      });
    if (page.complete) {
      const combined = page.items.some(
        (item) => item.state === "error" || item.state === "failure",
      )
        ? "failure"
        : page.items.length === 0 ||
            page.items.some((item) => item.state === "pending")
          ? "pending"
          : "success";
      if (combined !== page.combinedState)
        ctx.addIssue({
          code: "custom",
          path: ["combinedState"],
          message:
            "Общее состояние не соответствует полной странице commit statuses.",
        });
    }
  });

const unavailable = z.strictObject({
  status: z.literal("unavailable"),
  reason: z.enum([
    "not_configured",
    "repository_not_allowed",
    "unsupported_sha",
    "provider_unavailable",
    "invalid_response",
  ]),
});
const observed = z
  .strictObject({
    status: z.literal("observed"),
    repository: z.strictObject({
      id: providerId,
      fullName: z
        .string()
        .regex(
          /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/,
        ),
      url: z.string().max(256),
    }),
    commit: z.strictObject({
      sha: z.string().regex(/^[a-f0-9]{40}$/),
      url: z.string().max(320),
    }),
    pullRequests: z
      .array(
        z
          .strictObject({
            number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            url: z.string().max(320),
            state: z.enum(["open", "closed"]),
            draft: z.boolean(),
            merged: z.boolean(),
          })
          .refine((pr) => !pr.merged || (pr.state === "closed" && !pr.draft)),
      )
      .max(TASK_GIT_OBSERVATION_PULL_REQUEST_LIMIT),
    pullRequestsComplete: z.boolean(),
    ci: z.strictObject({
      checkRuns: z.discriminatedUnion("status", [ciUnavailable, checkRuns]),
      commitStatuses: z.discriminatedUnion("status", [
        ciUnavailable,
        commitStatuses,
      ]),
    }),
  })
  .superRefine((result, ctx) => {
    // URL строится из проверенных фактов: credentials, query и произвольный origin не допускаются.
    const repositoryUrl = `https://github.com/${result.repository.fullName}`;
    if (result.repository.url !== repositoryUrl)
      ctx.addIssue({
        code: "custom",
        path: ["repository", "url"],
        message: "Неканонический URL репозитория.",
      });
    if (result.commit.url !== `${repositoryUrl}/commit/${result.commit.sha}`)
      ctx.addIssue({
        code: "custom",
        path: ["commit", "url"],
        message: "Неканонический URL коммита.",
      });
    const numbers = new Set<number>();
    result.pullRequests.forEach((pr, index) => {
      if (
        pr.url !== `${repositoryUrl}/pull/${pr.number}` ||
        numbers.has(pr.number)
      )
        ctx.addIssue({
          code: "custom",
          path: ["pullRequests", index],
          message: "Неканонический или повторный PR.",
        });
      numbers.add(pr.number);
    });
    if (result.ci.checkRuns.status === "observed")
      result.ci.checkRuns.items.forEach((run, index) => {
        if (
          run.headSha !== result.commit.sha ||
          run.url !== `${repositoryUrl}/runs/${run.id}`
        )
          ctx.addIssue({
            code: "custom",
            path: ["ci", "checkRuns", "items", index],
            message: "CI относится к другому SHA или URL.",
          });
      });
  });

/** Runtime boundary injected owner; unknown и закрытые поля отклоняются на любой глубине. */
export const taskGitObservationProviderResultSchema = z.discriminatedUnion(
  "status",
  [unavailable, observed],
);

const observedItem = observed
  .safeExtend({ binding: taskGitBindingSchema })
  .superRefine((item, ctx) => {
    if (
      item.repository.fullName !== item.binding.repositoryId ||
      item.commit.sha !== item.binding.commitSha
    )
      ctx.addIssue({
        code: "custom",
        message: "Git-факты относятся к другой привязке.",
      });
  });
export const taskGitObservationItemSchema = z.discriminatedUnion("status", [
  unavailable.extend({ binding: taskGitBindingSchema }),
  observedItem,
]);

/** Ограниченный live-ответ не заменяет manual/unverified в TaskDto и не хранится в task history. */
export const taskGitObservationsSchema = z
  .strictObject({
    taskId: taskPublicIdSchema,
    taskRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    observedAt: z.iso.datetime(),
    complete: z.boolean(),
    items: z
      .array(taskGitObservationItemSchema)
      .max(TASK_GIT_OBSERVATION_LIMIT),
  })
  .superRefine((snapshot, ctx) => {
    if (
      !snapshot.complete &&
      snapshot.items.length !== TASK_GIT_OBSERVATION_LIMIT
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Неполный снимок должен содержать ограниченную первую страницу.",
      });
    const keys = snapshot.items.map((item) =>
      JSON.stringify([
        item.binding.repositoryId,
        item.binding.commitSha,
        item.binding.purpose,
      ]),
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Привязки снимка повторяются." });
  });

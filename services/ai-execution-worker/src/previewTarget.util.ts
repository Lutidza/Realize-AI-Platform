/**
 * @file services/ai-execution-worker/src/previewTarget.util.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Определяет статическую страницу предпросмотра по принятой области изменений.
 */

import { pathMatchesExecutionScope } from "@realize/change-engine";

import type { ClaimedPreviewDeployment } from "./previewTypes";
import { WorktreePolicyError } from "./worktree";

const referenceRoot = "src/app/(reference)/reference/";

/** Выбирает единственную reference page; смешанная область сохраняет проверку витрины. */
export const resolvePreviewTargetPath = (
  job: Pick<ClaimedPreviewDeployment, "allowedPaths" | "expectedPaths">,
): string => {
  if (
    job.expectedPaths.some(
      (path) => !pathMatchesExecutionScope(path, job.allowedPaths),
    )
  ) {
    throw new WorktreePolicyError(
      "Preview target paths differ from the approved scope.",
    );
  }
  const paths = [...job.allowedPaths, ...job.expectedPaths];
  if (!paths.length || !paths.every((path) => path.startsWith(referenceRoot))) {
    return "/";
  }
  if (
    paths.some(
      (path) =>
        /[\\%?#\u0000-\u0020\u007f]/.test(path) ||
        path.split("/").some((segment) => segment === "." || segment === ".."),
    )
  ) {
    throw new WorktreePolicyError("Reference preview scope has unsafe paths.");
  }
  const pages = job.expectedPaths.filter((path) => path.endsWith("/page.tsx"));
  if (pages.length !== 1) {
    throw new WorktreePolicyError(
      "Reference preview requires exactly one changed static page.tsx target.",
    );
  }
  const segments = pages[0].slice(referenceRoot.length, -"/page.tsx".length);
  const route = ["reference"];
  for (const segment of segments ? segments.split("/") : []) {
    // Только обычные route groups не входят в URL; interception/slots не выводятся автоматически.
    if (/^\([A-Za-z0-9_-]+\)$/.test(segment)) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(segment)) {
      throw new WorktreePolicyError(
        "Reference preview target requires static route segments without dynamic, private or intercepting routes.",
      );
    }
    route.push(segment);
  }
  return `/${route.join("/")}`;
};

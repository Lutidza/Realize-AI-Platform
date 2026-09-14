/**
 * @file packages/payload-ai-plugin/src/admin/usePagePublicationReview.hook.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Привязывает свидетельство пользователя к одной CAS/manifest версии и снимает его при смене scope или TTL.
 */
"use client";
import type {
  DataOperationDTO,
  PagePublicationReviewInput,
} from "@realize/ai-contracts";
import { useEffect, useMemo, useState } from "react";
import type { PagePublicationReviewChecks } from "./PagePublication.types";

const empty: PagePublicationReviewChecks = {
  desktop: false,
  mobile: false,
  noErrors: false,
};
export const usePagePublicationReview = (
  operation: DataOperationDTO,
  pending: boolean,
) => {
  const publication =
    operation.kind === "pages.publishDraft.v1" ||
    operation.kind === "pages.restorePublication.v1";
  const manifestHash = publication ? operation.preview.manifestHash : undefined;
  const checksPassed =
    !publication ||
    !operation.preview.checks.some(
      (check) => check.severity === "error" && check.status !== "passed",
    );
  const scope = useMemo(
    () => ({
      id: operation.id,
      version: operation.version,
      hash: operation.operationHash,
      state: operation.state,
      expiresAt: operation.expiresAt,
      manifestHash,
      pending,
    }),
    [
      operation.id,
      operation.version,
      operation.operationHash,
      operation.state,
      operation.expiresAt,
      manifestHash,
      pending,
    ],
  );
  const [stored, setStored] = useState({ scope, checks: empty });
  const [expiredScope, setExpiredScope] = useState<typeof scope>();
  const [initialNow] = useState(() => Date.now());
  const expired =
    expiredScope === scope || Date.parse(scope.expiresAt) <= initialNow;
  const checks = stored.scope === scope && !expired ? stored.checks : empty;
  useEffect(() => {
    if (!publication) return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (Date.parse(scope.expiresAt) <= Date.now()) setExpiredScope(scope);
          else schedule();
        },
        Math.min(
          2_147_483_647,
          Math.max(0, Date.parse(scope.expiresAt) - Date.now()),
        ),
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [scope, publication]);
  const review: PagePublicationReviewInput | undefined =
    manifestHash &&
    checksPassed &&
    !pending &&
    !expired &&
    checks.desktop &&
    checks.mobile &&
    checks.noErrors
      ? { manifestHash, desktop: true, mobile: true, noErrors: true }
      : undefined;
  const onChange = (
    key: keyof PagePublicationReviewChecks,
    checked: boolean,
  ) => {
    if (!pending && !expired)
      setStored({ scope, checks: { ...checks, [key]: checked } });
  };
  return { checks, review, expired, onChange };
};

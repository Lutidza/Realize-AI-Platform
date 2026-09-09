/**
 * @file .ai/tools/git-delivery/src/commit/GitCommitJournal.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Описывает исходный и принятый снимки одной операции commit.
 */
import type { Result } from "../GitDelivery.types.ts";
import type { Snapshot } from "../GitSnapshot.types.ts";

export type Journal = {
  version: 1;
  binding: string;
  original: Snapshot;
  paths: string[];
  recovery?: {
    attempt: number;
    previousFingerprint: string;
    snapshot: Snapshot;
  };
  noop?: true;
  preparedTree?: string;
  commit?: string;
  result?: Result;
};

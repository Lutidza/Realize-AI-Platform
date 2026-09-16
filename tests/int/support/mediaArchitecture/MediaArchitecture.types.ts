/**
 * @file tests/int/support/mediaArchitecture/MediaArchitecture.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Контракты изолированного proof без изменения generated типов приложения.
 */
import type { Payload, PayloadRequest, SanitizedConfig, File } from "payload";
import type { MediaRecipe } from "../../../../src/collections/Media/MediaProcessing.types";

export type MediaArchitectureConfigOptions = {
  connectionString: string;
  storageRoot: string;
  migrationDir: string;
};

export type MediaOriginalGuardTestOptions = {
  operation?: "create" | "update";
  data?: Record<string, unknown>;
  query?: Record<string, unknown>;
  file?: { mimetype: string; tempFilePath?: string };
  nativeSharp?: boolean;
  overwriteExistingFiles?: boolean;
};

export type MediaProofDocument = Record<string, unknown> & {
  id: number | string;
};

/** Изолированные slugs отсутствуют в product GeneratedTypes намеренно. */
export type MediaArchitectureLocalAPI = {
  create: (options: {
    collection: string;
    data: Record<string, unknown>;
    req: PayloadRequest;
    overrideAccess: false;
    file?: File;
    overwriteExistingFiles?: boolean;
  }) => Promise<MediaProofDocument>;
  findByID: (options: {
    collection: string;
    id: string | number;
    req: PayloadRequest;
    overrideAccess: false;
    depth: 0;
  }) => Promise<MediaProofDocument>;
  find: (options: {
    collection: string;
    req: PayloadRequest;
    overrideAccess: false;
    where?: Record<string, unknown>;
    depth: 0;
    limit: number;
  }) => Promise<{ docs: MediaProofDocument[]; totalDocs: number }>;
  update: (options: {
    collection: string;
    id: string | number;
    data: Record<string, unknown>;
    req: PayloadRequest;
    overrideAccess: false;
  }) => Promise<MediaProofDocument>;
};

export type MediaArchitectureJobsAPI = {
  queue: (options: {
    task: "mediaArchitectureProcess";
    input: { intentID: string };
    queue: "media-proof";
    req: PayloadRequest;
    overrideAccess: false;
  }) => Promise<{ id: string | number }>;
};

export type MediaArchitectureReadyVariant = {
  slot: string;
  format: "webp" | "jpeg" | "png";
  filename: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  byteLength: number;
  contentHash: string;
};

export type MediaArchitectureReadySet = {
  sourceHash: string;
  recipeHash: string;
  variantSetID: string;
  pipelineVersion: string;
  variants: MediaArchitectureReadyVariant[];
};

export type MediaArchitectureProofOptions = {
  payload: Payload;
  config: SanitizedConfig;
  key: string;
  storageRoot: string;
};

export type MediaArchitectureProofResult = {
  status: "passed";
  sourceHash: string;
  recipes: readonly MediaRecipe[];
  readySets: MediaArchitectureReadySet[];
  checks: Record<string, boolean | number>;
  metrics: {
    elapsedMs: number;
    cpuUserMs: number;
    cpuSystemMs: number;
    maxRSSKiB: number;
  };
};

export type IsolatedMediaArchitectureOptions = {
  workingConnectionString: string;
  artifactRoot?: string;
  beforeCleanup?: (context: {
    payload: Payload;
    config: SanitizedConfig;
    key: string;
    storageRoot: string;
    result: MediaArchitectureProofResult;
  }) => Promise<void>;
};

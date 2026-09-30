/**
 * @file packages/ai-contracts/src/designPreview.constants.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Ограничивает очередь и воспроизводимый браузерный capture Мастерской.
 * @see documentation/specifications/design-workshop.md
 */
export const DESIGN_PREVIEW = {
  renderer: "react-capture-v1",
  widths: [390, 768, 1440],
  height: 900,
  jobsPerProject: 100,
  attempts: 3,
  ttlSeconds: 86400,
  leaseSeconds: 30,
  heartbeatMs: 5000,
  imagesBytes: 4 * 1024 * 1024,
  imageBytes: 2 * 1024 * 1024,
  timeoutMs: 60000,
} as const;
export const DESIGN_PREVIEW_STATES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "expired",
] as const;
export const DESIGN_PREVIEW_ERRORS = [
  "UNAVAILABLE",
  "AUTH_REVOKED",
  "SOURCE_INVALID",
  "BUILD_FAILED",
  "RENDER_FAILED",
  "TIMEOUT",
  "LIMIT_EXCEEDED",
  "ATTEMPTS_EXHAUSTED",
  "INTERNAL_ERROR",
] as const;

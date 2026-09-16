/**
 * @file tests/int/support/mediaArchitecture/mediaArchitecture.adapter.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Ограничивает Local API изолированной схемой, сохраняя native ACL.
 */
import type { Payload } from "payload";
import type {
  MediaArchitectureJobsAPI,
  MediaArchitectureLocalAPI,
} from "./MediaArchitecture.types";

// Эта граница существует только в proof: его slugs не генерируются в product types.
export const mediaArchitectureAPI = (payload: Payload) =>
  payload as unknown as MediaArchitectureLocalAPI;

export const mediaArchitectureJobs = (payload: Payload) =>
  payload.jobs as unknown as MediaArchitectureJobsAPI;

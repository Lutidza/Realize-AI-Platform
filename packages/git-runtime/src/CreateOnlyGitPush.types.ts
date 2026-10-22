/**
 * @file packages/git-runtime/src/CreateOnlyGitPush.types.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Описывает адресный create-only publish; namespace и approval принадлежат вызывающему owner.
 */
export type CreateOnlyGitPushInput = {
  remoteURL: string;
  reference: string;
  commit: string;
};

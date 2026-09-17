/**
 * @file src/collections/Media/MediaProfile.types.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Описывает внутренний снимок native версии профиля для задания обработки.
 */

import type { Payload, PayloadRequest } from "payload";
import type { MediaRecipe } from "./MediaProcessing.types";

export type ReadMediaProfileSnapshotInput = {
  payload: Payload;
  req: PayloadRequest;
  profileID: number | string;
};

/** Снимок хранится вместе с заданием и не зависит от дальнейшего удаления native истории. */
export type MediaProfileSnapshot = Readonly<{
  profileID: number | string;
  profileVersionID: number;
  profileName: string;
  recipe: MediaRecipe;
}>;

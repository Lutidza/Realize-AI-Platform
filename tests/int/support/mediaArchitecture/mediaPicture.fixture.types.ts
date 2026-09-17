/**
 * @file tests/int/support/mediaArchitecture/mediaPicture.fixture.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Задаёт вход тестового native picture без подключения рабочего renderer.
 */
import type { MediaPictureDTO } from "../../../../src/collections/Media/MediaPicture.types";

export interface MediaPictureFixtureProps {
  picture: MediaPictureDTO;
  sizes: string;
}

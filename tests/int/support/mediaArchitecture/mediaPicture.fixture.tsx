/**
 * @file tests/int/support/mediaArchitecture/mediaPicture.fixture.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Отображает DTO готового набора через native picture только в архитектурном proof.
 */
import React from "react";
import type { MediaPictureFixtureProps } from "./mediaPicture.fixture.types";

/** sizes описывает фактический контейнер proof, а не настройки генерации файлов. */
export function MediaPictureFixture({
  picture,
  sizes,
}: MediaPictureFixtureProps) {
  return (
    <picture>
      {picture.sources.map((source) => (
        <source
          key={source.mimeType}
          type={source.mimeType}
          srcSet={source.srcSet}
          sizes={sizes}
        />
      ))}
      {/* Готовый файл доставляется напрямую; Next optimizer в этом proof не участвует. */}
      <img
        alt={picture.alt}
        src={picture.fallback.url}
        width={picture.fallback.width}
        height={picture.fallback.height}
        style={{ display: "block", height: "auto", maxWidth: "100%" }}
      />
    </picture>
  );
}

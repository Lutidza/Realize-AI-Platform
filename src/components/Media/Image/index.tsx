/**
 * @file src/components/Media/Image/index.tsx
 * @version 1.1.0
 * @date 2026-09-15
 * @description Выводит Media и пропускает повторное кодирование управляемой копии.
 * @see documentation/specifications/media-management.md
 */
"use client";

import type { StaticImageData } from "next/image";

import { cn } from "@/utilities/cn";
import NextImage from "next/image";
import React from "react";

import type { Props as MediaProps } from "../types";

import { cssVariables } from "@/cssVariables";
import { getMediaSrc } from "@/utilities/getMediaSrc";

const { breakpoints } = cssVariables;

export const Image: React.FC<MediaProps> = (props) => {
  const {
    alt: altFromProps,
    fill,
    height: heightFromProps,
    imgClassName,
    onClick,
    onLoad: onLoadFromProps,
    priority,
    resource,
    size: sizeFromProps,
    src: srcFromProps,
    width: widthFromProps,
  } = props;

  const [, setIsLoading] = React.useState(true);

  let width: number | undefined | null;
  let height: number | undefined | null;
  let alt = altFromProps;
  let src: StaticImageData | string = srcFromProps || "";

  if (!src && resource && typeof resource === "object") {
    const {
      alt: altFromResource,
      height: fullHeight,
      url,
      width: fullWidth,
    } = resource;

    width = widthFromProps ?? fullWidth;
    height = heightFromProps ?? fullHeight;
    alt = altFromResource;

    src = getMediaSrc(url);
  }

  // NOTE: this is used by the browser to determine which image to download at different screen sizes
  const sizes = sizeFromProps
    ? sizeFromProps
    : Object.entries(breakpoints)
        .map(([, value]) => `(max-width: ${value}px) ${value}px`)
        .join(", ");

  return (
    <NextImage
      unoptimized={
        !srcFromProps &&
        typeof resource === "object" &&
        resource?.managedDisplay === true
      }
      alt={alt || ""}
      className={cn(imgClassName)}
      fill={fill}
      height={!fill ? height || heightFromProps : undefined}
      onClick={onClick}
      onLoad={() => {
        setIsLoading(false);
        if (typeof onLoadFromProps === "function") {
          onLoadFromProps();
        }
      }}
      priority={priority}
      sizes={sizes}
      src={src}
      width={!fill ? width || widthFromProps : undefined}
    />
  );
};

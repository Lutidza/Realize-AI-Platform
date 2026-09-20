/**
 * @file packages/ui-kit/src/entity-mark/useUiEntityMark.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Возвращает иконку при ошибке картинки, сохраняя возможность сменить источник.
 */
import { useState } from "react";

export function useUiEntityMark(imageSrc?: string) {
  const [failedSource, setFailedSource] = useState<string>();
  return {
    showImage: Boolean(imageSrc && failedSource !== imageSrc),
    onError: () => setFailedSource(imageSrc),
  };
}

/**
 * @file tests/int/support/mediaArchitecture/mediaNativeEditor.fixture.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Связывает тестовый сборщик кадрирования с публичным контрактом Payload EditUpload.
 */
import type { EditUploadProps } from "@payloadcms/ui/elements/EditUpload";

export type MediaNativeEditorFixtureProps = Pick<
  EditUploadProps,
  "fileName" | "fileSrc" | "initialCrop" | "initialFocalPoint" | "onSave"
>;

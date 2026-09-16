/**
 * @file tests/int/support/mediaArchitecture/mediaNativeEditor.fixture.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Подключает настоящий публичный EditUpload как сборщик рецепта без штатного upload submit.
 */
import { ModalProvider } from "@faceless-ui/modal";
import { enTranslations } from "@payloadcms/translations/languages/en";
import { EditUpload } from "@payloadcms/ui/elements/EditUpload";
import { TranslationProvider } from "@payloadcms/ui/providers/Translation";
import React from "react";
import type { MediaNativeEditorFixtureProps } from "./mediaNativeEditor.fixture.types";

/** В рабочей админке эти провайдеры уже есть; fixture не подключается к Media collection. */
export function MediaNativeEditorFixture(props: MediaNativeEditorFixtureProps) {
  return (
    <TranslationProvider
      dateFNSKey="en-US"
      fallbackLang="en"
      language="en"
      languageOptions={[{ label: "English", value: "en" }]}
      switchLanguageServerAction={async () => undefined}
      translations={enTranslations}
    >
      <ModalProvider>
        <EditUpload {...props} showCrop showFocalPoint />
      </ModalProvider>
    </TranslationProvider>
  );
}

/**
 * @file src/blocks/Form/Component.types.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Контракт интерактивной формы витрины и её полей.
 */
import type { Form as FormType } from "@payloadcms/plugin-form-builder/types";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";

export type Value = unknown;
export interface Property {
  [key: string]: Value;
}
export interface Data {
  [key: string]: Property | Property[];
}

export type FormBlockType = {
  blockName?: string;
  blockType?: "formBlock";
  enableIntro: boolean;
  form: FormType;
  introContent?: SerializedEditorState;
};

/** ID блока соответствует nullable строковому идентификатору массива Payload. */
export type FormBlockProps = FormBlockType & {
  id?: string | null;
};

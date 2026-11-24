/**
 * @file src/registry/RealizeElementOwnerBinding.types.ts
 * @version 1.0.2
 * @date 2026-11-22
 * @description Разделяет глобальную identity и native source ссылку элементов host, включая app-owned компонент.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type {
  ElementIdentity,
  ElementOwnerRef,
} from "@realize/element-registry";

/** Это owner/source mapping; самостоятельные layout versions и все aliases задаёт layout catalog. */
export type RealizeElementOwnerBinding = {
  readonly identity: ElementIdentity;
  readonly owner: ElementOwnerRef;
} & (
  | {
      readonly kind: "collection";
      readonly source: {
        readonly definitionId: string;
        readonly definitionVersion: string;
      };
    }
  | {
      readonly kind: "component";
      readonly source: {
        readonly definitionId: string;
        readonly definitionVersion: string;
        readonly renderer: {
          readonly path: string;
          readonly exportName: string;
        };
      };
    }
  | {
      readonly kind: "template";
      readonly source: {
        readonly templateId: string;
        readonly templateVersion: string;
      };
    }
  | {
      readonly kind: "palette";
      readonly source: {
        readonly templateId: string;
        readonly templateVersion: string;
        readonly paletteId: string;
        readonly paletteVersion: string;
      };
    }
  | {
      readonly kind: "layout";
      readonly source: {
        readonly templateId: string;
        readonly templateVersion: string;
        readonly layoutId: string;
      };
    }
);

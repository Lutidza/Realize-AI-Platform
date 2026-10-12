/**
 * @file packages/template-realize/src/palettes/realizeTemplatePalettes.config.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Регистрирует compiled палитру Realize для обеих поддержанных modes.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplatePaletteDefinition } from "@realize/template-contracts/react";
import styles from "./RealizePalette.module.css";

/** Общие foundation tokens наследуются явно; navigation tokens/CSS принадлежат Realize. */
export const realizeTemplatePalettes: readonly TemplatePaletteDefinition[] = [
  {
    id: "realize",
    version: "0.1.0",
    className: styles.palette,
    modes: ["light", "dark"],
  },
];

/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIDrawer.tsx
 * @version 2026-08-28
 * @description Renders the compact Admin agent launcher and persistent side workspace.
 */

"use client";

import { Drawer, DrawerToggler, useModal } from "@payloadcms/ui";
import { Sparkles } from "lucide-react";

import { RealizeAIWorkspace } from "./RealizeAIWorkspace";
import styles from "./RealizeAIDrawer.module.css";

export const REALIZE_AI_DRAWER_SLUG = "realize-ai-global-drawer";

type RealizeAIDrawerProps = {
  hidden: boolean;
};

/** Makes the assistant available without leaving the current Admin page. */
export const RealizeAIDrawer = ({ hidden }: RealizeAIDrawerProps) => {
  const { closeModal, modalState } = useModal();
  const isOpen = Boolean(modalState[REALIZE_AI_DRAWER_SLUG]?.isOpen);
  if (hidden) return null;

  return (
    <>
      {!isOpen ? (
        <DrawerToggler
          aria-label="Открыть AI-ассистента"
          className={styles.launcher}
          data-testid="realize-ai-launcher"
          slug={REALIZE_AI_DRAWER_SLUG}
        >
          <Sparkles size={18} strokeWidth={1.9} />
          <span>Спросить AI</span>
        </DrawerToggler>
      ) : null}
      <Drawer
        className={styles.drawer}
        gutter={false}
        Header={null}
        slug={REALIZE_AI_DRAWER_SLUG}
        title="Realize AI"
      >
        <RealizeAIWorkspace
          onClose={() => closeModal(REALIZE_AI_DRAWER_SLUG)}
          variant="drawer"
        />
      </Drawer>
    </>
  );
};

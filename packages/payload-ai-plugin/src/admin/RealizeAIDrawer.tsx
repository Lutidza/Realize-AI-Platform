/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIDrawer.tsx
 * @version 2026-08-21
 * @description Renders the global Payload-native assistant launcher and side drawer.
 */

"use client";

import { Drawer, DrawerToggler, useModal } from "@payloadcms/ui";
import { Bot, Sparkles, X } from "lucide-react";

import { RealizeAIWorkspace } from "./RealizeAIWorkspace";
import styles from "./RealizeAIDrawer.module.css";

export const REALIZE_AI_DRAWER_SLUG = "realize-ai-global-drawer";

type RealizeAIDrawerProps = {
  hidden: boolean;
};

const DrawerHeader = () => {
  const { closeModal } = useModal();
  return (
    <header className={styles.header}>
      <span className={styles.brandIcon} aria-hidden="true">
        <Sparkles size={18} strokeWidth={1.8} />
      </span>
      <span className={styles.brandCopy}>
        <strong>Realize AI</strong>
        <small>Project copilot · approval-gated</small>
      </span>
      <button
        aria-label="Закрыть AI-ассистента"
        className={styles.closeButton}
        onClick={() => closeModal(REALIZE_AI_DRAWER_SLUG)}
        type="button"
      >
        <X size={19} />
      </button>
    </header>
  );
};

/** Makes the assistant available without leaving the current Admin page. */
export const RealizeAIDrawer = ({ hidden }: RealizeAIDrawerProps) => {
  const { modalState } = useModal();
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
          <Bot size={23} strokeWidth={1.8} />
          <span>AI</span>
        </DrawerToggler>
      ) : null}
      <Drawer
        className={styles.drawer}
        gutter={false}
        Header={<DrawerHeader />}
        slug={REALIZE_AI_DRAWER_SLUG}
        title="Realize AI"
      >
        <RealizeAIWorkspace variant="drawer" />
      </Drawer>
    </>
  );
};

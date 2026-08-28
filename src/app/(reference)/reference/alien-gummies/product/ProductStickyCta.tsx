/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductStickyCta.tsx
 * @version 2026-07-21
 * @description Fixed conversion bar matching the reference PDP desktop and mobile behavior.
 */
"use client";

import { useEffect, useState } from "react";

import styles from "./ProductStickyCta.module.css";

/** Renders the viewport-fixed product purchase CTA. */
export function ProductStickyCta() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      const purchasePanel = document.getElementById("purchase");

      setIsVisible(
        Boolean(
          purchasePanel && purchasePanel.getBoundingClientRect().bottom <= 0,
        ),
      );
    };

    updateVisibility();
    window.addEventListener("resize", updateVisibility);
    window.addEventListener("scroll", updateVisibility, { passive: true });

    return () => {
      window.removeEventListener("resize", updateVisibility);
      window.removeEventListener("scroll", updateVisibility);
    };
  }, []);

  return (
    <aside
      aria-hidden={!isVisible}
      aria-label="Быстрый переход к покупке"
      className={`${styles.bar} ${isVisible ? styles.visible : ""}`}
    >
      <a href="#purchase" tabIndex={isVisible ? 0 : -1}>
        Сэкономить 1 000 ₽ + доставка бесплатно
      </a>
    </aside>
  );
}

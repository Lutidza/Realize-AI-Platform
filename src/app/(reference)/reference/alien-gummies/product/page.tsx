/**
 * @file src/app/(reference)/reference/alien-gummies/product/page.tsx
 * @version 2026-07-21
 * @description Composes the complete Cosmo Gummy product-detail reference route.
 */
import type { Metadata } from "next";
import { Menu, ShoppingBag } from "lucide-react";
import Link from "next/link";

import { LimitedFlavorBanner } from "./LimitedFlavorBanner";
import { ProductAuthoritySection } from "./ProductAuthoritySection";
import { ProductBuybox } from "./ProductBuybox";
import { ProductComparisonSection } from "./ProductComparisonSection";
import { ProductFaqSection } from "./ProductFaqSection";
import { ProductFlavorSection } from "./ProductFlavorSection";
import { ProductProofSections } from "./ProductProofSections";
import { productReferenceMedia as media } from "./productReferenceMedia";
import { ProductReviewsSection } from "./ProductReviewsSection";
import { ProductSocialProofSections } from "./ProductSocialProofSections";
import { ProductStickyCta } from "./ProductStickyCta";
import styles from "./page.module.css";

export const metadata: Metadata = {
  description:
    "Полный референс карточки товара Cosmo Gummy в структуре Grüns PDP.",
  title: "Cosmo Gummy — карточка товара",
};

/** Renders the full route-private Cosmo Gummy reference PDP. */
export default function AlienGummiesProductReferencePage() {
  return (
    <main className={styles.page}>
      <div className={styles.announcement}>
        🛸 Новый вкус: малиновый лимонад 🛸
      </div>

      <header className={styles.header}>
        <Link
          aria-label="Cosmo Gummy reference"
          className={styles.brand}
          href="/reference/alien-gummies"
        >
          cosmo gummy
        </Link>
        <nav
          aria-label="Действия карточки товара"
          className={styles.headerActions}
        >
          <a className={styles.shopNow} href="#purchase">
            Купить
          </a>
          <a
            aria-label="Корзина"
            className={styles.iconButton}
            href="#purchase"
          >
            <ShoppingBag aria-hidden="true" size={19} />
          </a>
          <details className={styles.menu}>
            <summary aria-label="Открыть меню" className={styles.iconButton}>
              <Menu aria-hidden="true" size={20} />
            </summary>
            <nav aria-label="Разделы страницы" className={styles.menuPanel}>
              <a href="#purchase">Выбрать продукт</a>
              <a href="#details">О продукте</a>
              <Link href="/reference/alien-gummies">Каталог</Link>
            </nav>
          </details>
        </nav>
      </header>

      <ProductBuybox />
      <LimitedFlavorBanner imageSrc={media.pouch} />
      <ProductProofSections lifestyleImage={media.lifestyle} />
      <ProductSocialProofSections
        images={[
          media.lifestyle,
          media.support,
          media.timeline,
          media.reviews,
          media.clinical,
        ]}
      />
      <ProductComparisonSection />
      <ProductAuthoritySection imageSrc={media.shaun} />
      <ProductFlavorSection />
      <ProductFaqSection />
      <ProductReviewsSection />
      <ProductStickyCta />
    </main>
  );
}

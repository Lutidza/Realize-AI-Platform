/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductPurchaseOptions.tsx
 * @version 2026-07-21
 * @description Interactive subscription and one-time purchase option cards for the product buybox.
 */
"use client";

import { CheckCircle2 } from "lucide-react";

import { purchaseOptions } from "./productBuyboxContent";
import styles from "./ProductBuyboxPurchase.module.css";

type ProductPurchaseOptionsProps = {
  activeIndex: number;
  onSelect: (index: number) => void;
};

/** Renders accessible radio-card choices for the available purchase plans. */
export function ProductPurchaseOptions({
  activeIndex,
  onSelect,
}: ProductPurchaseOptionsProps) {
  return (
    <section className={styles.autoshipBlock} aria-labelledby="autoship-title">
      <h2 id="autoship-title">Автодоставка и выгода:</h2>
      <div className={styles.purchaseOptions}>
        {purchaseOptions.map((option, index) => (
          <label
            className={
              index === activeIndex
                ? styles.purchaseOptionActive
                : styles.purchaseOption
            }
            key={option.title}
          >
            <input
              checked={index === activeIndex}
              className={styles.srOnly}
              name="purchase-option"
              onChange={() => onSelect(index)}
              type="radio"
            />
            {option.value ? (
              <div
                className={
                  option.valueTone === "deal"
                    ? styles.purchaseRibbonDeal
                    : styles.purchaseRibbon
                }
              >
                {option.value}
              </div>
            ) : null}
            <div className={styles.purchaseOptionBody}>
              <div className={styles.purchaseHeading}>
                <span aria-hidden="true" className={styles.radioMark} />
                <div>
                  <strong>{option.title}</strong>
                  <em>{option.supply}</em>
                </div>
              </div>
              <div className={styles.purchasePrice}>
                <strong>{option.price}</strong>
                <del>{option.oldPrice}</del>
                <em>{option.daily}</em>
              </div>
            </div>
            {option.perks.length ? (
              <ul className={styles.purchasePerks}>
                {option.perks.map((perk) => (
                  <li key={perk}>
                    <CheckCircle2 aria-hidden="true" size={17} />
                    {perk}
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
        ))}
      </div>
    </section>
  );
}

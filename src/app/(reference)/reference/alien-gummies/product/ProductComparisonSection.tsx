/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductComparisonSection.tsx
 * @version 2026-07-21
 * @description Route-private comparison section matching the reference product-page structure.
 */
import { Check, Minus, X } from "lucide-react";

import styles from "./ProductComparisonSection.module.css";

const comparisonRows = [
  {
    cosmo: "107 ₽",
    label: "Стоимость порции",
    multi: "от 70 ₽",
    powder: "от 260 ₽",
  },
  { cosmo: "★★★★★", label: "Вкус", multi: "★★★", powder: "★★" },
  { cosmo: true, label: "Удобно взять с собой", multi: false, powder: false },
  { cosmo: true, label: "Без шейкера и уборки", multi: true, powder: false },
  { cosmo: "21+", label: "Витамины и минералы", multi: "<12", powder: "20+" },
  {
    cosmo: true,
    label: "Ягоды, овощи, пребиотики",
    multi: false,
    powder: true,
  },
] as const;

function ComparisonValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span>{value}</span>;

  return value ? (
    <Check aria-label="Да" size={21} strokeWidth={3} />
  ) : (
    <X aria-label="Нет" size={20} strokeWidth={3} />
  );
}

/** Renders the three-column Cosmo-versus-alternatives comparison. */
export function ProductComparisonSection() {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <header>
          <p>Us vs. them</p>
          <h2>Мы vs. остальные</h2>
          <span>Комплексное питание без лишней сложности и переплаты.</span>
        </header>

        <div className={styles.tableWrap}>
          <div
            className={styles.table}
            role="table"
            aria-label="Сравнение форматов"
          >
            <div className={styles.tableHeader} role="row">
              <span aria-label="Параметр" role="columnheader" />
              <strong className={styles.cosmoHead} role="columnheader">
                cosmo gummy
              </strong>
              <strong role="columnheader">
                <Minus aria-hidden="true" size={24} />
                Мультивитамины
              </strong>
              <strong role="columnheader">
                <Minus aria-hidden="true" size={24} />
                Зелёный порошок
              </strong>
            </div>
            {comparisonRows.map((row) => (
              <div className={styles.tableRow} role="row" key={row.label}>
                <strong role="rowheader">{row.label}</strong>
                <div className={styles.cosmoCell} role="cell">
                  <ComparisonValue value={row.cosmo} />
                </div>
                <div role="cell">
                  <ComparisonValue value={row.multi} />
                </div>
                <div role="cell">
                  <ComparisonValue value={row.powder} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

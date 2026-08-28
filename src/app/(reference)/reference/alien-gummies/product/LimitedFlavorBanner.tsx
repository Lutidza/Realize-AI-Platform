/**
 * @file src/app/(reference)/reference/alien-gummies/product/LimitedFlavorBanner.tsx
 * @version 2026-07-21
 * @description Route-private limited-flavor banner for the Cosmo Gummy PDP reference.
 */
import styles from "./LimitedFlavorBanner.module.css";

type BannerTrimProps = {
  edge: "bottom" | "top";
};

type LimitedFlavorBannerProps = {
  imageSrc: string;
};

function BannerTrim({ edge }: BannerTrimProps) {
  const waveId = `limited-flavor-wave-${edge}`;
  const stripeId = `limited-flavor-stripe-${edge}`;
  const maskId = `limited-flavor-mask-${edge}`;

  return (
    <svg
      aria-hidden="true"
      className={
        edge === "bottom" ? `${styles.trim} ${styles.trimBottom}` : styles.trim
      }
      focusable="false"
    >
      <defs>
        <pattern
          height="40"
          id={waveId}
          patternUnits="userSpaceOnUse"
          width="44.357"
        >
          <path
            d="M0 31.881C11.087 31.881 11.087 39.777 22.178 39.777S33.265 31.881 44.357 31.881V0H0Z"
            fill="var(--berry-dark)"
          />
        </pattern>
        <pattern
          height="40"
          id={stripeId}
          patternUnits="userSpaceOnUse"
          width="21.08"
        >
          <rect fill="var(--pink)" height="40" width="7" />
        </pattern>
        <mask id={maskId}>
          <rect fill={`url(#${waveId})`} height="100%" width="100%" />
        </mask>
      </defs>
      <rect fill={`url(#${waveId})`} height="100%" width="100%" />
      <rect
        fill={`url(#${stripeId})`}
        height="100%"
        mask={`url(#${maskId})`}
        width="100%"
      />
    </svg>
  );
}

/** Renders the reference promo composition using the route's inherited brand palette. */
export function LimitedFlavorBanner({ imageSrc }: LimitedFlavorBannerProps) {
  return (
    <section className={styles.section}>
      <BannerTrim edge="top" />
      <div className={styles.inner}>
        <div className={styles.copy}>
          <h2>Не упусти эксклюзивный вкус</h2>
          <p>
            Не упусти лимитированный малиновый лимонад — он доступен, пока
            партия есть на складе.
          </p>
          <a href="#purchase">Купить сейчас</a>
        </div>
        <figure aria-hidden="true" className={styles.visual}>
          {/* eslint-disable-next-line @next/next/no-img-element -- The route intentionally preserves the source asset's intrinsic crop. */}
          <img alt="" src={imageSrc} />
        </figure>
      </div>
      <BannerTrim edge="bottom" />
    </section>
  );
}

/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductProofSections.tsx
 * @version 2026-07-21
 * @description Route-private nutrition proof sequence for the Cosmo Gummy PDP reference.
 */
import styles from "./ProductProofSections.module.css";

type ProductProofSectionsProps = {
  lifestyleImage: string;
};

const usageStats = [
  {
    label:
      "покупателей принимают Cosmo Gummy 4–6 раз в неделю, а 80% — ежедневно.*",
    value: "95%",
  },
  {
    label: "говорят, что их общее самочувствие стало лучше.*",
    value: "67%",
  },
  {
    label: "отмечают более комфортное и регулярное пищеварение.*",
    value: "67%",
  },
  {
    label: "чувствуют больше энергии в течение дня.*",
    value: "52%",
  },
];

const qualityChecks = [
  "70 видов пестицидов",
  "4 группы тяжёлых металлов",
  "16 видов загрязнителей",
  "9 микробиологических показателей",
];

/** Renders the reference-matched deficiency, usage-statistics, and quality blocks. */
export function ProductProofSections({
  lifestyleImage,
}: ProductProofSectionsProps) {
  return (
    <section
      aria-label="Исследования и контроль качества"
      className={styles.flow}
    >
      <article className={styles.deficiencyCard}>
        <div className={styles.deficiencyCopy}>
          <h2>Современный ритм оставляет пробелы в рационе</h2>
          <p>Cosmo Gummy закрывает их в формате одного ежедневного стика.</p>

          <dl className={styles.deficiencyStats}>
            <div>
              <dt>90%</dt>
              <dd>
                людей не добирают рекомендованные витамины и минералы ежедневно¹
              </dd>
            </div>
            <div>
              <dt>61%</dt>
              <dd>
                сталкиваются с дискомфортом пищеварения хотя бы раз в неделю²
              </dd>
            </div>
          </dl>

          <a className={styles.cta} href="#purchase">
            Сэкономить и оформить доставку
          </a>
          <small className={styles.sources}>
            <a
              href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9710417/"
              rel="noreferrer"
              target="_blank"
            >
              ¹ Источник
            </a>
            <a
              href="https://europepmc.org/article/MED/30323268"
              rel="noreferrer"
              target="_blank"
            >
              ² Источник
            </a>
          </small>
        </div>

        <figure className={styles.lifestyleVisual}>
          {/* eslint-disable-next-line @next/next/no-img-element -- The reference route preserves the source image crop. */}
          <img alt="Ежедневный стик Cosmo Gummy" src={lifestyleImage} />
        </figure>
      </article>

      <article className={styles.validationCard}>
        <section
          aria-labelledby="usage-proof-title"
          className={styles.usageSection}
        >
          <header className={styles.sectionHeader}>
            <h2 id="usage-proof-title">
              Легко съесть, удобно взять, проверено
            </h2>
            <p>
              Cosmo Gummy удобно брать с собой, но нам было важно понять, что
              происходит после первых месяцев. Вот что отметили покупатели через
              три месяца регулярного приёма.
            </p>
          </header>

          <dl className={styles.usageStats}>
            {usageStats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.value}</dt>
                <dd>{stat.label}</dd>
              </div>
            ))}
          </dl>

          <small className={styles.surveyNote}>
            *По результатам опроса 3 000+ покупателей, принимавших продукт
            ежедневно.
          </small>
        </section>

        <div aria-hidden="true" className={styles.divider} />

        <section
          aria-labelledby="quality-proof-title"
          className={styles.qualitySection}
        >
          <header className={styles.sectionHeader}>
            <h2 id="quality-proof-title">Качество, которому можно доверять</h2>
            <p>
              Каждая партия проверяется по заявленным витаминам и минералам, а
              также на отсутствие потенциальных загрязнителей, включая:
            </p>
          </header>

          <ul className={styles.qualityChecks}>
            {qualityChecks.map((check) => (
              <li key={check}>
                <span aria-hidden="true">×</span>
                {check}
              </li>
            ))}
          </ul>
        </section>
      </article>
    </section>
  );
}

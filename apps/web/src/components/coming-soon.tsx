import styles from "./ui.module.css";

/** Écran honnête pour une section planifiée mais pas encore construite : aucun faux bouton. */
export function ComingSoon({
  title,
  intro,
  phase,
  planned,
}: {
  title: string;
  intro: string;
  phase: string;
  planned: string[];
}) {
  return (
    <main className="page">
      <header className={styles.pageHead}>
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>
      <section className={styles.empty}>
        <p className="eyebrow">Pas encore disponible · {phase}</p>
        <h2>Cette section n&apos;est pas encore développée.</h2>
        <p>Ce qui est prévu, dans l&apos;ordre :</p>
        <ul>
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

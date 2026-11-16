import { getCatalogSnapshot } from "@/lib/catalog";
import { FlaskIcon } from "./icons";
import styles from "./ui.module.css";

/** Rappel permanent tant que l'application sert le jeu fictif : aucun prix affiché n'est réel. */
export async function DemoBanner() {
  const { dataset } = await getCatalogSnapshot();
  if (dataset.kind !== "demo") return null;
  return (
    <aside className={styles.demoBanner} role="note">
      <FlaskIcon width={16} height={16} />
      <p>
        <strong>{dataset.label}.</strong> Marques, magasins et prix sont inventés pour le développement ; aucun
        n&apos;est un prix réel.
      </p>
    </aside>
  );
}

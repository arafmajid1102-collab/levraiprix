import Link from "next/link";
import { ScanIcon, SearchIcon } from "./icons";
import styles from "./ui.module.css";

/** Formulaire GET natif : fonctionne sans JavaScript et produit une URL partageable. */
export function SearchForm({ defaultValue = "", category }: { defaultValue?: string; category?: string }) {
  return (
    <form action="/recherche" className={styles.searchForm} role="search">
      <SearchIcon />
      <label htmlFor="q" className="sr-only">
        Rechercher un produit ou saisir un code-barres
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Lessive, sacs-poubelle, ou code-barres…"
        autoComplete="off"
        enterKeyHint="search"
      />
      {category ? <input type="hidden" name="categorie" value={category} /> : null}
      <Link href="/scanner" className={styles.scan} aria-label="Scanner un code-barres" title="Scanner un code-barres">
        <ScanIcon />
      </Link>
      <button type="submit" className={styles.button}>
        Rechercher
      </button>
    </form>
  );
}

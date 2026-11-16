"use client";

import { brand } from "@lvp/design-system";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoxIcon, HomeIcon, ListIcon, SearchIcon, UserIcon } from "./icons";
import styles from "./nav.module.css";

const items = [
  { href: "/", label: "Accueil", Icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/recherche", label: "Prix", Icon: SearchIcon, match: (p: string) => p.startsWith("/recherche") || p.startsWith("/produit") },
  { href: "/stocks", label: "Stocks", Icon: BoxIcon, match: (p: string) => p.startsWith("/stocks") },
  { href: "/courses", label: "Courses", Icon: ListIcon, match: (p: string) => p.startsWith("/courses") },
  { href: "/profil", label: "Profil", Icon: UserIcon, match: (p: string) => p.startsWith("/profil") },
] as const;

export function Wordmark() {
  return (
    <Link href="/" className={styles.wordmark} aria-label={`${brand.name} — accueil`}>
      {brand.wordmark.lead}
      <span>{brand.wordmark.accent}</span>
    </Link>
  );
}

/** Barre latérale sur ordinateur, barre d'onglets en bas sur mobile (même composant, même liens). */
export function PrimaryNav() {
  return <NavView pathname={usePathname()} />;
}

/** Rendu immédiat, avant que l'adresse courante soit connue : mêmes liens, aucun actif. */
export function PrimaryNavFallback() {
  return <NavView pathname={null} />;
}

function NavView({ pathname }: { pathname: string | null }) {
  return (
    <nav className={styles.nav} aria-label="Navigation principale">
      <div className={styles.brand}>
        <Wordmark />
      </div>
      <ul className={styles.list}>
        {items.map(({ href, label, Icon, match }) => {
          const active = pathname !== null && match(pathname);
          return (
            <li key={href}>
              <Link href={href} className={styles.link} aria-current={active ? "page" : undefined}>
                <Icon />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

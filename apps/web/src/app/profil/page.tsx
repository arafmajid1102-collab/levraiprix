import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";
import { MyStoresPanel } from "@/components/my-stores-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import ui from "@/components/ui.module.css";
import { getCatalogSnapshot } from "@/lib/catalog";
import styles from "./profil.module.css";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { dataset, products, views } = await getCatalogSnapshot();
  const offers = views.reduce((n, v) => n + v.ranked.length + v.unranked.length, 0);
  return (
    <main className="page">
      <header className={ui.pageHead}>
        <h1>Profil</h1>
        <p>Vos réglages et votre compte. L&apos;application s&apos;utilise aussi sans compte.</p>
      </header>

      <section className={`${ui.card} ${styles.block}`}>
        <div>
          <h2>Apparence</h2>
          <p className="muted">Le choix est enregistré sur cet appareil uniquement.</p>
        </div>
        <ThemeToggle />
      </section>

      <AccountPanel />

      <MyStoresPanel />

      <section className={`${ui.card} ${styles.block}`}>
        <div>
          <h2>Données affichées</h2>
          <p className="muted">
            {dataset.label} : {products.length} produits, {offers} offres.{" "}
            {dataset.kind === "demo"
              ? "Aucune source de prix réelle n'est encore connectée."
              : "Seuls les relevés validés sont affichés."}
          </p>
        </div>
      </section>
    </main>
  );
}

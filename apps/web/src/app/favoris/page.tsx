import type { Metadata } from "next";
import { FavoritesList } from "@/components/favorites";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Mes favoris" };

export default function FavoritesPage() {
  return (
    <main className="page">
      <header className={ui.pageHead}>
        <h1>Mes favoris</h1>
        <p>Les produits que vous suivez, avec leur meilleur prix constaté.</p>
      </header>
      <FavoritesList />
    </main>
  );
}

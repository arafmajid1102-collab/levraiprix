import type { Metadata } from "next";
import { Suspense } from "react";
import { ContributeForm } from "@/components/contribute-form";
import ui from "@/components/ui.module.css";
import { getCatalogSnapshot } from "@/lib/catalog";

export const metadata: Metadata = { title: "Ajouter un prix" };

export default async function ContributePage() {
  const { categories } = await getCatalogSnapshot();
  const options = categories.map((c) => ({ id: c.id, name: c.name, countsWashes: c.comparisonBasis === "per_wash" }));
  return (
    <main className="page">
      <header className={ui.pageHead}>
        <h1>Ajouter un prix</h1>
        <p>
          Indiquez un prix que vous avez vu en magasin. Chaque relevé est relu avant d&apos;être publié, pour que le
          catalogue ne contienne que des prix réels.
        </p>
      </header>
      <Suspense fallback={<p className="muted">Chargement…</p>}>
        <ContributeForm categories={options} />
      </Suspense>
    </main>
  );
}

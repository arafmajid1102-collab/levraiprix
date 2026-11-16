import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Stocks" };

export default function StocksPage() {
  return (
    <ComingSoon
      title="Stocks"
      intro="L'inventaire de votre foyer, pour savoir ce qu'il vous reste et éviter d'acheter en double."
      phase="phase 4"
      planned={[
        "Comptes et foyers (nécessaires pour enregistrer un inventaire)",
        "Ajout manuel et par code-barres, par emplacement (cuisine, buanderie…)",
        "Seuils d'alerte et durée restante estimée — toujours signalée comme estimation",
      ]}
    />
  );
}

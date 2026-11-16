import type { Metadata } from "next";
import { BarcodeScanner } from "@/components/barcode-scanner";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Scanner un code-barres" };

export default function ScannerPage() {
  return (
    <main className="page">
      <header className={ui.pageHead}>
        <h1>Scanner un code-barres</h1>
        <p>Visez le code-barres d&apos;un produit pour ouvrir sa fiche et comparer ses prix.</p>
      </header>
      <BarcodeScanner />
    </main>
  );
}

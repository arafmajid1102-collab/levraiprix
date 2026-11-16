import type { Metadata } from "next";
import { ModerationQueue } from "@/components/my-submissions";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Validation des relevés", robots: { index: false } };

export default function ModerationPage() {
  return (
    <main className="page">
      <header className={ui.pageHead}>
        <h1>Validation des relevés</h1>
        <p>
          Valider un relevé le rend public, ainsi que le produit et le magasin qu&apos;il concerne. Un relevé refusé
          reste invisible.
        </p>
      </header>
      <ModerationQueue />
    </main>
  );
}

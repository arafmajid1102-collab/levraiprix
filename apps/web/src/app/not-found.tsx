import Link from "next/link";
import ui from "@/components/ui.module.css";

export default function NotFound() {
  return (
    <main className="page">
      <section className={ui.empty}>
        <p className="eyebrow">Erreur 404</p>
        <h2>Cette page n&apos;existe pas</h2>
        <p>Le lien est peut-être incomplet, ou le produit a été retiré du catalogue.</p>
        <Link href="/recherche" className={ui.button}>
          Rechercher un produit
        </Link>
      </section>
    </main>
  );
}

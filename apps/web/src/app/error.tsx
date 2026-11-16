"use client";

import ui from "@/components/ui.module.css";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <section className={ui.empty} role="alert">
        <p className="eyebrow">Problème de chargement</p>
        <h2>Impossible d&apos;afficher cette page</h2>
        <p>Les données n&apos;ont pas pu être chargées. Vérifiez votre connexion, puis réessayez.</p>
        <button type="button" className={ui.button} onClick={reset}>
          Réessayer
        </button>
      </section>
    </main>
  );
}

"use client";

import type { ProductView } from "@lvp/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getProductViews } from "@/lib/actions";
import { usePersonal } from "@/lib/personal";
import auth from "./auth.module.css";
import { StarIcon } from "./icons";
import { ProductCard } from "./product-card";
import styles from "./personal.module.css";
import ui from "./ui.module.css";

/** Bouton « favori » de la fiche produit. */
export function FavoriteButton({ productId }: { productId: string }) {
  const personal = usePersonal();
  const [error, setError] = useState<string | null>(null);
  if (!personal) {
    return (
      <Link href="/connexion" className={styles.favorite}>
        <StarIcon width={18} height={18} />
        Se connecter pour suivre ce produit
      </Link>
    );
  }
  const { store, state } = personal;
  const on = state.favorites.has(productId);
  return (
    <>
      <button
        type="button"
        className={styles.favorite}
        aria-pressed={on}
        disabled={state.status !== "ready"}
        onClick={async () => {
          const result = await store.toggleFavorite(productId);
          setError(result.ok ? null : result.message);
        }}
      >
        <StarIcon width={18} height={18} />
        {on ? "Dans vos favoris" : "Ajouter aux favoris"}
      </button>
      {error ? (
        <p className={auth.message} data-tone="error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

type Loaded = { key: string; asOf: string; views: ProductView[] };

/**
 * Favoris de l'utilisateur. `compact` : section d'accueil, invisible tant
 * qu'il n'y a rien à montrer ; sinon page complète avec ses états vides.
 */
export function FavoritesList({ compact = false }: { compact?: boolean }) {
  const personal = usePersonal();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  const ids = personal ? [...personal.state.favorites].sort() : [];
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getProductViews(key.split(",")).then(
      (result) => !cancelled && setLoaded({ key, ...result }),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!personal) {
    return compact ? null : (
      <section className={ui.empty}>
        <h2>Connectez-vous pour retrouver vos favoris</h2>
        <p>Vos favoris sont enregistrés dans votre compte et vous suivent sur tous vos appareils.</p>
        <Link href="/connexion" className={ui.button}>
          Se connecter
        </Link>
      </section>
    );
  }
  if (personal.state.status === "loading") return compact ? null : <p className="muted" aria-busy="true">Chargement…</p>;
  if (personal.state.status === "error" || failed) {
    return compact ? null : (
      <p className={auth.message} data-tone="error" role="alert">
        Vos favoris n&apos;ont pas pu être chargés. Rechargez la page.
      </p>
    );
  }
  if (ids.length === 0) {
    return compact ? null : (
      <section className={ui.empty}>
        <h2>Aucun favori pour l&apos;instant</h2>
        <p>Ouvrez la fiche d&apos;un produit et choisissez « Ajouter aux favoris » pour le retrouver ici.</p>
        <Link href="/recherche" className={ui.button}>
          Chercher un produit
        </Link>
      </section>
    );
  }
  // Tant que la nouvelle liste charge, on garde l'ancienne, filtrée : un favori retiré disparaît aussitôt.
  const views = loaded?.views.filter((view) => personal.state.favorites.has(view.product.id)) ?? null;
  if (!views) return compact ? null : <p className="muted" aria-busy="true">Chargement…</p>;
  const missing = loaded?.key === key ? ids.length - views.length : 0;

  const grid = (
    <ul className={ui.grid}>
      {views.map((view) => (
        <li key={view.product.id}>
          <ProductCard view={view} asOf={loaded!.asOf} />
        </li>
      ))}
    </ul>
  );
  if (compact) {
    return views.length > 0 ? (
      <section className={ui.section}>
        <div className={ui.sectionHead}>
          <h2>Vos favoris</h2>
          <p>
            <Link href="/favoris">Tout voir</Link>
          </p>
        </div>
        {grid}
      </section>
    ) : null;
  }
  return (
    <section className={ui.section}>
      {grid}
      {missing > 0 ? (
        <p className="muted">
          {missing} favori{missing > 1 ? "s ne sont" : " n'est"} plus disponible{missing > 1 ? "s" : ""} dans le catalogue.
        </p>
      ) : null}
    </section>
  );
}

export interface StoreOfferSummary {
  storeId: string;
  storeLabel: string;
  unitPrice: string;
  price: string;
}

/** Sur la fiche produit : le meilleur prix parmi les magasins habituels de l'utilisateur. */
export function MyStoresOffer({ offers }: { offers: StoreOfferSummary[] }) {
  const personal = usePersonal();
  if (!personal || personal.state.status !== "ready") return null;
  const { stores } = personal.state;
  if (stores.size === 0) {
    return (
      <p className={styles.mine}>
        <Link href="/profil#magasins">Choisissez vos magasins habituels</Link> pour voir ici le meilleur prix près de
        chez vous.
      </p>
    );
  }
  // `offers` est déjà classé du moins cher au plus cher.
  const mine = offers.filter((offer) => stores.has(offer.storeId));
  const best = mine[0];
  if (!best) {
    return (
      <p className={styles.mine}>
        Aucun de vos magasins habituels n&apos;a de prix récent pour ce produit.{" "}
        <Link href="/profil#magasins">Modifier mes magasins</Link>
      </p>
    );
  }
  const rank = offers.indexOf(best) + 1;
  return (
    <p className={styles.mine} data-found>
      <strong>Dans vos magasins :</strong> <span className="num">{best.unitPrice}</span> (
      <span className="num">{best.price}</span>) chez {best.storeLabel}.{" "}
      {rank === 1 ? "C'est le meilleur prix constaté." : `${rank}ᵉ prix sur ${offers.length} magasins comparés.`}
    </p>
  );
}

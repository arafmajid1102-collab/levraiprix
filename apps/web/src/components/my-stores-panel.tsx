"use client";

import { matchesQuery, proximityLabel, sortStoresByProximity, storeProximity, type Proximity } from "@lvp/core";
import { listContributableStores, type ContributableStore } from "@lvp/data-supabase";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "@/lib/account";
import { usePersonal } from "@/lib/personal";
import auth from "./auth.module.css";
import styles from "./personal.module.css";
import ui from "./ui.module.css";

type Notice = { tone: "error" | "good"; text: string } | null;
const groups: Proximity[] = ["same_postal_code", "same_department", "elsewhere"];

/** Bloc du profil : commune de l'utilisateur et magasins où il fait ses courses. */
export function MyStoresPanel() {
  const account = useAccount();
  const personal = usePersonal();
  const [stores, setStores] = useState<ContributableStore[] | null>(null);
  const [postalCode, setPostalCode] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const client = account.status === "signedIn" ? account.client : null;
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    listContributableStores(client).then((result) => {
      if (cancelled) return;
      if (result.ok) setStores(result.value);
      else setNotice({ tone: "error", text: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!personal) return null;
  const { store, state } = personal;
  const home = state.home;
  // Tant que l'utilisateur n'a rien tapé, les champs montrent la valeur enregistrée.
  const postalValue = postalCode ?? home.postalCode ?? "";
  const cityValue = city ?? home.city ?? "";

  async function saveHome(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await store.saveHome({ postalCode: postalValue, city: cityValue });
    setBusy(false);
    setNotice(
      result.ok
        ? { tone: "good", text: result.value.postalCode ? "Commune enregistrée." : "Commune effacée." }
        : { tone: "error", text: result.message },
    );
  }

  async function toggle(storeId: string) {
    const result = await store.toggleStore(storeId);
    setNotice(result.ok ? null : { tone: "error", text: result.message });
  }

  const visible = stores
    ? sortStoresByProximity(
        stores.filter((s) => !filter.trim() || matchesQuery(`${s.retailerName} ${s.name} ${s.city} ${s.postalCode}`, filter)),
        home.postalCode,
      )
    : [];

  return (
    <section className={`${ui.card} ${auth.account}`} id="magasins">
      <div>
        <h2>Mes magasins</h2>
        <p className="muted">
          Indiquez votre commune et cochez les magasins où vous faites vos courses : chaque fiche produit vous
          montrera le meilleur prix parmi eux. Ces informations restent privées.
        </p>
      </div>

      <div className={auth.item}>
        <form onSubmit={saveHome} noValidate className={styles.home}>
          <div className={auth.field}>
            <label htmlFor="home-postal">Code postal</label>
            <input id="home-postal" className={auth.input} value={postalValue} onChange={(e) => setPostalCode(e.target.value)} inputMode="numeric" maxLength={5} autoComplete="postal-code" />
          </div>
          <div className={auth.field}>
            <label htmlFor="home-city">Ville</label>
            <input id="home-city" className={auth.input} value={cityValue} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" />
          </div>
          <button type="submit" className={auth.secondary} disabled={busy || state.status !== "ready"}>
            Enregistrer
          </button>
        </form>
        {notice ? (
          <p className={auth.message} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
            {notice.text}
          </p>
        ) : null}
      </div>

      <div className={auth.item}>
        {stores === null || state.status === "loading" ? (
          <p className="muted" aria-busy="true">Chargement des magasins…</p>
        ) : stores.length === 0 ? (
          <p className="muted">
            Aucun magasin n&apos;est encore enregistré. Ils apparaissent ici dès qu&apos;un prix y a été relevé :{" "}
            <Link href="/contribuer" className={auth.link}>
              ajouter un prix
            </Link>
            .
          </p>
        ) : (
          <>
            {stores.length > 8 ? (
              <div className={auth.field} style={{ width: "100%" }}>
                <label htmlFor="store-filter">Filtrer les magasins</label>
                <input id="store-filter" className={auth.input} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Enseigne, ville ou code postal" />
              </div>
            ) : null}
            {visible.length === 0 ? <p className="muted">Aucun magasin ne correspond.</p> : null}
            {groups.map((group) => {
              const inGroup = visible.filter((s) => storeProximity(s, home.postalCode) === group);
              if (inGroup.length === 0) return null;
              return (
                <div key={group} className={styles.group}>
                  {home.postalCode ? <h4>{proximityLabel[group]}</h4> : null}
                  {inGroup.map((s) => (
                    <label key={s.id} className={styles.storeRow}>
                      <input type="checkbox" checked={state.stores.has(s.id)} onChange={() => toggle(s.id)} />
                      <span>
                        <strong>
                          {s.retailerName === "Indépendant" ? "" : `${s.retailerName} — `}
                          {s.name}
                        </strong>
                        <small>
                          {s.postalCode} {s.city}
                          {s.pending ? " · en attente de validation" : ""}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}

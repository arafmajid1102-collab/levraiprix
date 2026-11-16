"use client";

import { formatDate, formatPrice, formatQuantity, methodLabel } from "@lvp/core";
import {
  getProofUrl,
  listMySubmissions,
  listPendingSubmissions,
  reviewStatusLabel,
  reviewSubmission,
  type Submission,
} from "@lvp/data-supabase";
import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { refreshCatalog } from "@/lib/actions";
import auth from "./auth.module.css";
import styles from "./contribute.module.css";
import scanner from "./scanner.module.css";
import ui from "./ui.module.css";

type Client = Parameters<typeof listMySubmissions>[0];

const tone = { pending: "info", accepted: "good", rejected: "danger" } as const;

/** Affiche la photo jointe, à la demande, par un lien temporaire. */
function Proof({ client, path }: { client: Client; path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (url) {
    // Lien signé de courte durée vers un fichier privé : next/image ne s'applique pas.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Photo jointe au relevé" className={scanner.proof} />;
  }
  return (
    <>
      <button
        type="button"
        className={auth.secondary}
        onClick={async () => {
          const signed = await getProofUrl(client, path);
          if (signed) setUrl(signed);
          else setFailed(true);
        }}
      >
        Voir la photo
      </button>
      {failed ? <span className={auth.note}>Photo indisponible.</span> : null}
    </>
  );
}

function Entry({ item, client, children }: { item: Submission; client: Client; children?: React.ReactNode }) {
  return (
    <li className={`${ui.card} ${styles.entry}`}>
      <div className={styles.entryMain}>
        <strong>{item.productName}</strong>
        <small>
          {[item.brandName, formatQuantity(item.quantity), item.categoryName, item.barcode].filter(Boolean).join(" · ")}
        </small>
        <small>
          {item.storeLabel} · relevé du {formatDate(item.observedAt)}
        </small>
        <div className={styles.flags}>
          {item.isPromo ? (
            <span className={ui.badge} data-tone="warn">
              Promotion{item.referencePriceCents ? ` · prix barré ${formatPrice(item.referencePriceCents)}` : ""}
              {item.promoLabel ? ` · ${item.promoLabel}` : ""}
            </span>
          ) : null}
          <span className={ui.badge} data-tone={item.proofPath ? "good" : "muted"}>
            {methodLabel[item.method]}
          </span>
          {item.newProduct ? <span className={ui.badge}>Nouveau produit</span> : null}
          {item.newStore ? <span className={ui.badge}>Nouveau magasin</span> : null}
        </div>
      </div>
      <span className={`${styles.entryPrice} num`}>{formatPrice(item.priceCents)}</span>
      {children}
      {item.proofPath ? (
        <div className={`${auth.row} ${scanner.proofBox}`}>
          <Proof client={client} path={item.proofPath} />
        </div>
      ) : null}
    </li>
  );
}

/** Les envois de l'utilisateur et leur état. */
export function MySubmissions({ client, userId, refreshKey }: { client: Client; userId: string; refreshKey: number }) {
  const [items, setItems] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMySubmissions(client, userId).then((result) => {
      if (cancelled) return;
      if (result.ok) setItems(result.value);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [client, userId, refreshKey]);

  if (error) return <p className={auth.message} data-tone="error" role="alert">{error}</p>;
  if (!items || items.length === 0) return null;
  return (
    <section className={ui.section}>
      <div className={ui.sectionHead}>
        <h2>Mes envois</h2>
      </div>
      <ul className={styles.list}>
        {items.map((item) => (
          <Entry key={item.id} item={item} client={client}>
            <span className={ui.badge} data-solid data-tone={tone[item.status]}>
              {reviewStatusLabel[item.status]}
            </span>
          </Entry>
        ))}
      </ul>
    </section>
  );
}

/** File d'attente de validation, réservée aux modérateurs. */
export function ModerationQueue() {
  const account = useAccount();
  const [items, setItems] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const client = account.status === "signedIn" && account.moderator ? account.client : null;
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    listPendingSubmissions(client).then((result) => {
      if (cancelled) return;
      if (result.ok) setItems(result.value);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (account.status === "loading") return <p className={auth.note} aria-busy="true">Chargement…</p>;
  if (!client) {
    return (
      <section className={ui.empty}>
        <h2>Accès réservé</h2>
        <p>Cette page est réservée aux modérateurs. Connectez-vous avec un compte modérateur pour y accéder.</p>
      </section>
    );
  }

  async function decide(id: string, accept: boolean) {
    setBusy(id);
    setError(null);
    const result = await reviewSubmission(client!, id, accept);
    if (result.ok) {
      if (accept) await refreshCatalog();
      setItems((current) => current?.filter((item) => item.id !== id) ?? null);
    } else {
      setError(result.message);
    }
    setBusy(null);
  }

  return (
    <section className={ui.section}>
      {error ? <p className={auth.message} data-tone="error" role="alert">{error}</p> : null}
      {items === null ? (
        <p className={auth.note} aria-busy="true">Chargement…</p>
      ) : items.length === 0 ? (
        <div className={ui.empty}>
          <h2>Rien à valider</h2>
          <p>Tous les relevés reçus ont été traités.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <Entry key={item.id} item={item} client={client}>
              <div className={auth.row}>
                <button type="button" className={ui.button} disabled={busy !== null} onClick={() => decide(item.id, true)}>
                  Valider
                </button>
                <button type="button" className={auth.danger} disabled={busy !== null} onClick={() => decide(item.id, false)}>
                  Refuser
                </button>
              </div>
            </Entry>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import {
  PASSWORD_MIN_LENGTH,
  changePassword,
  deleteAccount,
  exportAccountData,
  signOut,
} from "@lvp/data-supabase";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAccount } from "@/lib/account";
import styles from "./auth.module.css";
import ui from "./ui.module.css";

type Notice = { tone: "error" | "good"; text: string } | null;

function Message({ notice }: { notice: Notice }) {
  return notice ? (
    <p className={styles.message} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </p>
  ) : null;
}

/** Bloc « Compte » du profil : connexion, mot de passe, export et suppression des données. */
export function AccountPanel() {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [exportNotice, setExportNotice] = useState<Notice>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<Notice>(null);

  if (account.status === "unavailable") {
    return (
      <section className={`${ui.card} ${styles.account}`}>
        <div>
          <h2>Compte</h2>
          <p className="muted">
            Les comptes ne sont pas disponibles en mode démonstration : aucune base de données n&apos;est
            connectée.
          </p>
        </div>
      </section>
    );
  }
  if (account.status === "loading") {
    return (
      <section className={`${ui.card} ${styles.account}`} aria-busy="true">
        <div>
          <h2>Compte</h2>
          <p className="muted">Chargement…</p>
        </div>
      </section>
    );
  }
  if (account.status === "signedOut") {
    return (
      <section className={`${ui.card} ${styles.account}`}>
        <div>
          <h2>Compte</h2>
          <p className="muted">
            Vous n&apos;êtes pas connecté. La recherche et la comparaison des prix fonctionnent sans compte ; il
            servira à retrouver vos réglages sur tous vos appareils et à contribuer des prix.
          </p>
        </div>
        <div className={styles.row}>
          <Link href="/connexion" className={ui.button}>
            Se connecter
          </Link>
          <Link href="/inscription" className={styles.secondary}>
            Créer un compte
          </Link>
        </div>
      </section>
    );
  }

  const { client, email } = account;

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await changePassword(client, password);
    setBusy(false);
    if (result.ok) setPassword("");
    setPasswordNotice(result.ok ? { tone: "good", text: "Mot de passe enregistré." } : { tone: "error", text: result.message });
  }

  async function downloadExport() {
    setBusy(true);
    setExportNotice(null);
    try {
      const data = await exportAccountData(client);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `le-vrai-prix-mes-donnees-${data.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExportNotice({ tone: "good", text: "Fichier téléchargé." });
    } catch (error) {
      setExportNotice({ tone: "error", text: error instanceof Error ? error.message : "Export impossible." });
    }
    setBusy(false);
  }

  async function confirmDelete() {
    setBusy(true);
    const result = await deleteAccount(client);
    setBusy(false);
    // En cas de succès la session se ferme et ce bloc repasse en « non connecté ».
    if (!result.ok) setDeleteNotice({ tone: "error", text: result.message });
    setConfirmingDelete(false);
  }

  return (
    <section className={`${ui.card} ${styles.account}`}>
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <div>
          <h2>Compte</h2>
          <p className="muted">
            Connecté avec <strong>{email}</strong>
          </p>
        </div>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => signOut(client)}>
          Se déconnecter
        </button>
      </div>

      <div className={styles.item}>
        <div>
          <h3>Favoris et contributions</h3>
          <p className="muted">Retrouvez les produits que vous suivez, ajoutez un prix vu en magasin.</p>
        </div>
        <div className={styles.row}>
          <Link href="/favoris" className={styles.secondary}>
            Mes favoris
          </Link>
          <Link href="/contribuer" className={styles.secondary}>
            Ajouter un prix
          </Link>
          {account.moderator ? (
            <Link href="/moderation" className={styles.secondary}>
              Valider les relevés
            </Link>
          ) : null}
        </div>
      </div>

      <div className={styles.item}>
        <div>
          <h3>Mot de passe</h3>
          <p className="muted">Choisissez un nouveau mot de passe ({PASSWORD_MIN_LENGTH} caractères au minimum).</p>
        </div>
        <form onSubmit={submitPassword} noValidate>
          <label htmlFor="new-password" className="sr-only">
            Nouveau mot de passe
          </label>
          <input
            id="new-password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Nouveau mot de passe"
          />
          <button type="submit" className={styles.secondary} disabled={busy}>
            Enregistrer
          </button>
        </form>
        <Message notice={passwordNotice} />
      </div>

      <div className={styles.item}>
        <div>
          <h3>Mes données</h3>
          <p className="muted">
            Téléchargez tout ce que nous conservons sur vous : compte, profil, favoris, magasins et prix
            contribués.
          </p>
        </div>
        <button type="button" className={styles.secondary} disabled={busy} onClick={downloadExport}>
          Exporter mes données
        </button>
        <Message notice={exportNotice} />
      </div>

      <div className={styles.item}>
        <div>
          <h3>Supprimer mon compte</h3>
          <p className="muted">
            Définitif. Votre profil, vos favoris et vos réglages sont effacés. Les prix que vous avez contribués
            restent dans le catalogue, sans aucun lien avec vous.
          </p>
        </div>
        {confirmingDelete ? (
          <div className={styles.row}>
            <button type="button" className={styles.danger} disabled={busy} onClick={confirmDelete}>
              {busy ? "Suppression…" : "Oui, supprimer définitivement"}
            </button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirmingDelete(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className={styles.danger} disabled={busy} onClick={() => setConfirmingDelete(true)}>
            Supprimer mon compte
          </button>
        )}
        <Message notice={deleteNotice} />
      </div>
    </section>
  );
}

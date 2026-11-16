"use client";

import {
  CODE_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  requestLoginCode,
  resendSignupCode,
  signInWithPassword,
  signUp,
  verifyCode,
  type AuthResult,
  type CodeKind,
} from "@lvp/data-supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "@/lib/account";
import styles from "./auth.module.css";
import ui from "./ui.module.css";

type Mode = "signin" | "signup";
type Method = "password" | "code";
type Notice = { tone: "error" | "info" | "good"; text: string } | null;

const errorOf = (result: AuthResult): Notice => (result.ok ? null : { tone: "error", text: result.message });

/** Connexion et création de compte : formulaire, puis saisie du code reçu par e-mail. */
export function AuthFlow({ mode }: { mode: Mode }) {
  const account = useAccount();
  const router = useRouter();
  const [method, setMethod] = useState<Method>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingCode, setPendingCode] = useState<CodeKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const signedIn = account.status === "signedIn";
  useEffect(() => {
    if (signedIn) router.replace("/profil");
  }, [signedIn, router]);

  if (account.status === "unavailable") {
    return (
      <div className={`${ui.card} ${styles.panel}`}>
        <p className={styles.note}>
          Les comptes ne sont pas disponibles en mode démonstration : aucune base de données n&apos;est
          connectée à ce site.
        </p>
        <Link href="/" className={styles.link}>
          Revenir à l&apos;accueil
        </Link>
      </div>
    );
  }
  if (account.status !== "signedOut") {
    return (
      <div className={`${ui.card} ${styles.panel}`} aria-busy="true">
        <p className={styles.note}>{signedIn ? "Vous êtes connecté. Redirection…" : "Chargement…"}</p>
      </div>
    );
  }
  const { client } = account;

  async function run(action: () => Promise<AuthResult>, onOk?: () => void) {
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    if (result.ok) onOk?.();
    else setNotice(errorOf(result));
    return result;
  }

  const askCode = (kind: CodeKind) => {
    setCode("");
    setPendingCode(kind);
  };

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (mode === "signup") {
      await run(() => signUp(client, email, password), () => askCode("signup"));
    } else if (method === "code") {
      await run(() => requestLoginCode(client, email), () => askCode("login"));
    } else {
      const result = await run(() => signInWithPassword(client, email, password));
      // Compte créé mais jamais confirmé : on renvoie un code et on passe à la saisie.
      if (!result.ok && result.reason === "unconfirmed") {
        await resendSignupCode(client, email);
        askCode("signup");
        setNotice({ tone: "info", text: "Votre adresse n'est pas encore confirmée : un nouveau code vient d'être envoyé." });
      }
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    // La session ouverte déclenche la redirection vers le profil.
    await run(() => verifyCode(client, email, code, pendingCode!));
  }

  async function resend() {
    const kind = pendingCode!;
    await run(
      () => (kind === "signup" ? resendSignupCode(client, email) : requestLoginCode(client, email)),
      () => setNotice({ tone: "good", text: "Un nouveau code a été envoyé. Seul le dernier code reçu est valable." }),
    );
  }

  const message = notice ? (
    <p className={styles.message} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </p>
  ) : null;

  if (pendingCode) {
    return (
      <div className={`${ui.card} ${styles.panel}`}>
        <form className={styles.form} onSubmit={submitCode} noValidate>
          <p className={styles.note}>
            {pendingCode === "signup" ? "Si cette adresse n'a pas déjà de compte" : "Si un compte existe pour cette adresse"}
            , un code à {CODE_LENGTH} chiffres vient d&apos;être envoyé à <strong>{normalizeEmail(email)}</strong>. Il est
            valable une heure.
          </p>
          <div className={styles.field}>
            <label htmlFor="code">Code reçu par e-mail</label>
            <input
              id="code"
              className={`${styles.input} ${styles.code}`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={CODE_LENGTH}
              autoFocus
              required
            />
          </div>
          {message}
          <button type="submit" className={`${ui.button} ${styles.submit}`} disabled={busy}>
            {busy ? "Vérification…" : "Valider le code"}
          </button>
        </form>
        <div className={styles.row}>
          <button type="button" className={styles.secondary} onClick={resend} disabled={busy}>
            Renvoyer un code
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => {
              setPendingCode(null);
              setNotice(null);
            }}
          >
            Changer d&apos;adresse
          </button>
        </div>
        <p className={styles.note}>
          Rien reçu ? Vérifiez les indésirables.{" "}
          {pendingCode === "signup" ? (
            <>
              Si vous aviez déjà un compte, <Link href="/connexion" className={styles.link}>connectez-vous</Link>.
            </>
          ) : (
            <>
              Si vous n&apos;avez pas encore de compte, <Link href="/inscription" className={styles.link}>créez-le</Link>.
            </>
          )}
        </p>
      </div>
    );
  }

  const withPassword = mode === "signup" || method === "password";
  return (
    <div className={`${ui.card} ${styles.panel}`}>
      {mode === "signin" ? (
        <div className={styles.methods} role="radiogroup" aria-label="Méthode de connexion">
          {(
            [
              ["password", "Mot de passe"],
              ["code", "Code par e-mail"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              disabled={busy}
              onClick={() => {
                setMethod(value);
                setNotice(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <form className={styles.form} onSubmit={submitForm} noValidate>
        <div className={styles.field}>
          <label htmlFor="email">Adresse e-mail</label>
          <input
            id="email"
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
        </div>
        {withPassword ? (
          <div className={styles.field}>
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? PASSWORD_MIN_LENGTH : undefined}
              aria-describedby={mode === "signup" ? "password-hint" : undefined}
              required
            />
            {mode === "signup" ? <small id="password-hint">{PASSWORD_MIN_LENGTH} caractères au minimum.</small> : null}
          </div>
        ) : (
          <p className={styles.note}>
            Nous vous envoyons un code à usage unique. C&apos;est aussi la solution si vous avez oublié votre mot
            de passe : vous pourrez en choisir un nouveau depuis votre profil.
          </p>
        )}
        {message}
        <button type="submit" className={`${ui.button} ${styles.submit}`} disabled={busy}>
          {busy
            ? "Un instant…"
            : mode === "signup"
              ? "Créer mon compte"
              : method === "code"
                ? "Recevoir un code"
                : "Se connecter"}
        </button>
      </form>
      {mode === "signup" ? (
        <>
          <p className={styles.note}>
            Nous enregistrons uniquement votre adresse e-mail et votre mot de passe, qui n&apos;est jamais conservé
            en clair. Vous pouvez exporter ou supprimer votre compte à tout moment depuis votre profil.
          </p>
          <p className={styles.note}>
            Déjà inscrit ? <Link href="/connexion" className={styles.link}>Se connecter</Link>
          </p>
        </>
      ) : (
        <p className={styles.note}>
          Pas encore de compte ? <Link href="/inscription" className={styles.link}>Créer un compte</Link>
        </p>
      )}
    </div>
  );
}

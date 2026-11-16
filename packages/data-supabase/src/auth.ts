/**
 * Comptes : logique commune au site et à l'application mobile.
 *
 * Le parcours repose sur un code à six chiffres envoyé par e-mail (jamais sur
 * un lien), pour être identique sur les deux plateformes. Toutes les fonctions
 * renvoient un résultat explicite avec un message en français : aucun écran
 * n'a à interpréter une erreur technique.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { removeMyProofs } from "./contributions";
import type { SupabaseConfig } from "./index";

export const PASSWORD_MIN_LENGTH = 10;
export const CODE_LENGTH = 6;

/** Stockage de session fourni par la plateforme (localStorage, trousseau du téléphone…). */
export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Client avec session persistante. Sans `storage`, supabase-js utilise localStorage (navigateur). */
export function createSessionClient(config: SupabaseConfig, storage?: SessionStorage): SupabaseClient {
  return createClient(config.url, config.publicKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage },
  });
}

export type AuthFailure = "invalid" | "unconfirmed" | "rate_limited" | "network" | "other";
export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure; message: string };

const ok: AuthResult = { ok: true };
const fail = (reason: AuthFailure, message: string): AuthResult => ({ ok: false, reason, message });

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email)) ? null : "Saisissez une adresse e-mail valide.";
}

export function validatePassword(password: string): string | null {
  return password.length >= PASSWORD_MIN_LENGTH
    ? null
    : `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
}

export const normalizeCode = (code: string) => code.replace(/\D/g, "");

export function validateCode(code: string): string | null {
  return normalizeCode(code).length === CODE_LENGTH ? null : `Le code comporte ${CODE_LENGTH} chiffres.`;
}

interface ErrorLike {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
}

/** Traduit une erreur d'authentification en message compréhensible. */
export function describeAuthError(error: ErrorLike): AuthResult {
  switch (error.code) {
    case "invalid_credentials":
      return fail("invalid", "Adresse e-mail ou mot de passe incorrect.");
    case "email_not_confirmed":
      return fail("unconfirmed", "Cette adresse n'est pas encore confirmée. Saisissez le code reçu par e-mail.");
    case "otp_expired":
      return fail("invalid", "Ce code est incorrect ou a expiré. Demandez-en un nouveau.");
    case "weak_password":
      return fail("invalid", `Mot de passe trop faible : ${PASSWORD_MIN_LENGTH} caractères au minimum.`);
    case "same_password":
      return fail("invalid", "Le nouveau mot de passe doit être différent de l'ancien.");
    case "email_address_invalid":
    case "validation_failed":
      return fail("invalid", "Cette adresse e-mail n'est pas acceptée.");
    case "user_already_exists":
    case "email_exists":
      return fail("invalid", "Un compte existe déjà pour cette adresse. Connectez-vous.");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return fail("rate_limited", "Trop de tentatives. Patientez quelques minutes avant de réessayer.");
  }
  if (error.status === 429) return fail("rate_limited", "Trop de tentatives. Patientez quelques minutes avant de réessayer.");
  if (error.name === "AuthRetryableFetchError" || error.status === 0 || /fetch|network/i.test(error.message ?? "")) {
    return fail("network", "Connexion au service impossible. Vérifiez votre réseau et réessayez.");
  }
  return fail("other", "Une erreur est survenue. Réessayez dans un instant.");
}

const done = (error: ErrorLike | null): AuthResult => (error ? describeAuthError(error) : ok);

/** Type de code attendu : confirmation d'inscription, ou connexion sans mot de passe. */
export type CodeKind = "signup" | "login";

/**
 * Crée le compte et envoie le code de confirmation. Si l'adresse a déjà un
 * compte, le service répond de la même façon sans rien envoyer (il ne révèle
 * pas quelles adresses sont inscrites) : l'écran doit le dire à l'utilisateur.
 */
export async function signUp(client: SupabaseClient, email: string, password: string): Promise<AuthResult> {
  const invalid = validateEmail(email) ?? validatePassword(password);
  if (invalid) return fail("invalid", invalid);
  return done((await client.auth.signUp({ email: normalizeEmail(email), password })).error);
}

export async function signInWithPassword(client: SupabaseClient, email: string, password: string): Promise<AuthResult> {
  const invalid = validateEmail(email);
  if (invalid) return fail("invalid", invalid);
  if (!password) return fail("invalid", "Saisissez votre mot de passe.");
  return done((await client.auth.signInWithPassword({ email: normalizeEmail(email), password })).error);
}

/**
 * Envoie un code de connexion. N'inscrit jamais personne ; si aucun compte
 * n'existe, la réponse reste un succès pour ne pas révéler l'existence du compte.
 */
export async function requestLoginCode(client: SupabaseClient, email: string): Promise<AuthResult> {
  const invalid = validateEmail(email);
  if (invalid) return fail("invalid", invalid);
  const { error } = await client.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: false },
  });
  if (error?.code === "otp_disabled" || error?.code === "signup_disabled" || error?.code === "user_not_found") return ok;
  return done(error);
}

export async function resendSignupCode(client: SupabaseClient, email: string): Promise<AuthResult> {
  return done((await client.auth.resend({ type: "signup", email: normalizeEmail(email) })).error);
}

/** Vérifie le code ; en cas de succès la session est ouverte. */
export async function verifyCode(client: SupabaseClient, email: string, code: string, kind: CodeKind): Promise<AuthResult> {
  const invalid = validateCode(code);
  if (invalid) return fail("invalid", invalid);
  const { error } = await client.auth.verifyOtp({
    email: normalizeEmail(email),
    token: normalizeCode(code),
    type: kind === "signup" ? "signup" : "email",
  });
  return done(error);
}

export async function signOut(client: SupabaseClient): Promise<AuthResult> {
  // « local » : ferme la session de cet appareil même si le réseau est coupé.
  return done((await client.auth.signOut({ scope: "local" })).error);
}

/** Définit ou change le mot de passe du compte connecté. */
export async function changePassword(client: SupabaseClient, password: string): Promise<AuthResult> {
  const invalid = validatePassword(password);
  if (invalid) return fail("invalid", invalid);
  return done((await client.auth.updateUser({ password })).error);
}

/** Supprime définitivement le compte connecté et ses données personnelles. */
export async function deleteAccount(client: SupabaseClient): Promise<AuthResult> {
  const { data } = await client.auth.getSession();
  const userId = data.session?.user.id;
  // Les photos de preuve partent d'abord : après la suppression, plus personne ne pourrait les retirer.
  if (!userId || !(await removeMyProofs(client, userId))) {
    return fail("other", "La suppression n'a pas abouti. Réessayez dans un instant.");
  }
  const { error } = await client.rpc("delete_my_account");
  if (error) return fail("other", "La suppression n'a pas abouti. Réessayez dans un instant.");
  await client.auth.signOut({ scope: "local" });
  return ok;
}

export interface AccountExport {
  exportedAt: string;
  account: { id: string; email: string | null; createdAt: string };
  profile: unknown;
  households: unknown[];
  favorites: unknown[];
  stores: unknown[];
  priceSubmissions: unknown[];
}

/**
 * Rassemble toutes les données personnelles du compte connecté (portabilité,
 * RGPD art. 20). Les règles RLS limitent déjà chaque lecture à l'utilisateur.
 */
export async function exportAccountData(client: SupabaseClient, now: Date = new Date()): Promise<AccountExport> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Session expirée : reconnectez-vous pour exporter vos données.");
  const user = data.user;
  const read = async (table: string, column: string): Promise<unknown[]> => {
    const result = await client.from(table).select("*").eq(column, user.id);
    if (result.error) throw new Error(`Export impossible (${table}) : ${result.error.message}`);
    return result.data ?? [];
  };
  const [profile, households, favorites, stores, priceSubmissions] = await Promise.all([
    read("profiles", "id"),
    read("household_members", "user_id"),
    read("favorites", "user_id"),
    read("user_stores", "user_id"),
    read("price_observations", "submitted_by"),
  ]);
  return {
    exportedAt: now.toISOString(),
    account: { id: user.id, email: user.email ?? null, createdAt: user.created_at },
    profile: profile[0] ?? null,
    households,
    favorites,
    stores,
    priceSubmissions,
  };
}

/**
 * Ferme la session locale si le compte n'existe plus côté serveur (compte
 * supprimé depuis un autre appareil, par exemple). Une simple panne réseau
 * ne déconnecte pas. Renvoie vrai si la session a été fermée.
 */
export async function dropSessionIfAccountGone(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.auth.getUser();
  if (!error || ![401, 403, 404].includes(error.status ?? 0)) return false;
  await client.auth.signOut({ scope: "local" });
  return true;
}

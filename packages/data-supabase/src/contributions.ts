/**
 * Contributions : proposer un prix (et, si besoin, le produit et le magasin),
 * suivre ses envois, et — pour les modérateurs — les valider.
 *
 * La validation des saisies est faite ici, en fonctions pures, pour être
 * identique sur le site et dans l'application. La base revérifie tout (RLS,
 * contraintes) : ces contrôles servent à donner des messages clairs.
 */
import {
  isValidGtin,
  matchesQuery,
  normalizeBarcode,
  type BrandType,
  type CollectionMethod,
  type ContentUnit,
  type Product,
  type Store,
} from "@lvp/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_COLUMNS, STORE_COLUMNS, toProduct, toStore, type ProductRow, type StoreRow } from "./rows";

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (message: string): Result<never> => ({ ok: false, message });

export type ReviewStatus = "pending" | "accepted" | "rejected";
export const reviewStatusLabel: Record<ReviewStatus, string> = {
  pending: "En attente de validation",
  accepted: "Publié",
  rejected: "Refusé",
};

export const contentUnitLabel: Record<ContentUnit, string> = {
  l: "litres (L)",
  ml: "millilitres (mL)",
  kg: "kilogrammes (kg)",
  g: "grammes (g)",
  unit: "unités (sacs, éponges…)",
};

// ───────────────────────── Saisies ─────────────────────────

/** « 3,49 », « 3.49 € », « 3 » → centimes. Refuse tout ce qui n'est pas un montant net. */
export function parsePriceInput(input: string): number | null {
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(input.replace(/[\s€]/g, ""));
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

/** « 1,5 » → 1.5 (trois décimales au plus). */
export function parseDecimalInput(input: string): number | null {
  const match = /^\d{1,6}(?:[.,]\d{1,3})?$/.exec(input.trim());
  if (!match) return null;
  const value = Number(input.trim().replace(",", "."));
  return value > 0 ? value : null;
}

function parseCount(input: string): number | null {
  return /^\d{1,4}$/.test(input.trim()) && Number(input) > 0 ? Number(input) : null;
}

export interface ProductDraft {
  name: string;
  brand: string;
  brandType: BrandType;
  categoryId: string;
  barcode: string;
  amount: string;
  unit: ContentUnit;
  packCount: string;
  usesCount: string;
}

export interface NewProduct {
  name: string;
  brand: string | null;
  brandType: BrandType;
  categoryId: string;
  barcode: string | null;
  amount: number;
  unit: ContentUnit;
  packCount: number;
  usesCount: number | null;
}

export function validateProductDraft(draft: ProductDraft): Result<NewProduct> {
  const name = draft.name.trim();
  if (name.length < 3 || name.length > 200) return fail("Donnez le nom du produit tel qu'il figure sur l'emballage.");
  if (draft.brand.trim().length > 80) return fail("Le nom de la marque est trop long.");
  if (!draft.categoryId) return fail("Choisissez une catégorie.");
  const barcode = normalizeBarcode(draft.barcode);
  if (barcode && !isValidGtin(barcode)) return fail("Ce code-barres n'est pas valide. Vérifiez les chiffres, ou laissez le champ vide.");
  const amount = parseDecimalInput(draft.amount);
  if (amount === null) return fail("Indiquez la contenance (par exemple 1,5).");
  const packCount = draft.packCount.trim() ? parseCount(draft.packCount) : 1;
  if (packCount === null) return fail("Le nombre d'articles du lot doit être un entier (1 si le produit est vendu seul).");
  const usesCount = draft.usesCount.trim() ? parseCount(draft.usesCount) : null;
  if (draft.usesCount.trim() && usesCount === null) return fail("Le nombre de lavages doit être un entier.");
  return ok({
    name,
    brand: draft.brand.trim() || null,
    brandType: draft.brandType,
    categoryId: draft.categoryId,
    barcode: barcode || null,
    amount,
    unit: draft.unit,
    packCount,
    usesCount,
  });
}

export interface StoreDraft {
  retailer: string;
  name: string;
  postalCode: string;
  city: string;
}

export function validateStoreDraft(draft: StoreDraft): Result<StoreDraft> {
  const value = {
    retailer: draft.retailer.trim(),
    name: draft.name.trim(),
    postalCode: draft.postalCode.trim(),
    city: draft.city.trim(),
  };
  if (value.name.length < 2 || value.name.length > 120) return fail("Donnez le nom du magasin (par exemple « Centre-ville »).");
  if (value.retailer.length > 80) return fail("Le nom de l'enseigne est trop long.");
  if (!/^\d{5}$/.test(value.postalCode)) return fail("Le code postal comporte cinq chiffres.");
  if (value.city.length < 1 || value.city.length > 80) return fail("Indiquez la ville.");
  return ok(value);
}

export interface PriceDraft {
  price: string;
  /** Date du relevé au format AAAA-MM-JJ. */
  observedOn: string;
  isPromo: boolean;
  referencePrice: string;
  promoLabel: string;
}

export interface NewPrice {
  priceCents: number;
  observedAt: string;
  isPromo: boolean;
  referencePriceCents: number | null;
  promoLabel: string | null;
}

/** Ancienneté maximale d'un relevé saisi à la main. */
export const MAX_BACKDATE_DAYS = 90;

export const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function validatePriceDraft(draft: PriceDraft, now: Date = new Date()): Result<NewPrice> {
  const priceCents = parsePriceInput(draft.price);
  if (priceCents === null) return fail("Indiquez le prix payé, par exemple 3,49.");
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.observedOn);
  // Midi, heure locale : la date reste la bonne quel que soit le fuseau.
  const observed = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12) : null;
  if (!observed || Number.isNaN(observed.getTime()) || toDateInput(observed) !== draft.observedOn) {
    return fail("Indiquez la date à laquelle vous avez vu ce prix.");
  }
  if (draft.observedOn > toDateInput(now)) return fail("La date du relevé ne peut pas être dans le futur.");
  if (now.getTime() - observed.getTime() > MAX_BACKDATE_DAYS * 86_400_000) {
    return fail(`Le relevé doit dater de moins de ${MAX_BACKDATE_DAYS} jours.`);
  }
  let referencePriceCents: number | null = null;
  if (draft.isPromo && draft.referencePrice.trim()) {
    referencePriceCents = parsePriceInput(draft.referencePrice);
    if (referencePriceCents === null) return fail("Le prix barré n'est pas un montant valide.");
    if (referencePriceCents <= priceCents) return fail("Le prix barré doit être supérieur au prix payé.");
  }
  const promoLabel = draft.isPromo ? draft.promoLabel.trim().slice(0, 80) || null : null;
  // Un relevé du jour porte l'heure réelle, sans jamais dépasser « maintenant ».
  const observedAt = draft.observedOn === toDateInput(now) ? now : observed;
  return ok({ priceCents, observedAt: observedAt.toISOString(), isPromo: draft.isPromo, referencePriceCents, promoLabel });
}

// ───────────────────────── Lecture pour le formulaire ─────────────────────────

const describe = (what: string, error: { message: string }) => fail(`${what} : ${friendly(error.message)}`);

function friendly(message: string): string {
  if (/fetch|network/i.test(message)) return "connexion au service impossible.";
  if (/row-level security|permission denied|28000|Authentification/i.test(message)) return "reconnectez-vous puis réessayez.";
  return "réessayez dans un instant.";
}

export type ContributableProduct = Product & { pending: boolean };
export type ContributableStore = Store & { pending: boolean };

/** Produits visibles par l'utilisateur connecté : publiés, plus ses propres propositions. */
export async function searchContributableProducts(client: SupabaseClient, text: string): Promise<Result<ContributableProduct[]>> {
  const needle = text.trim();
  const barcode = normalizeBarcode(needle);
  let query = client.from("products").select(`${PRODUCT_COLUMNS},review_status`).neq("review_status", "rejected").order("name").limit(1000);
  if (isValidGtin(barcode)) query = query.eq("barcode", barcode);
  const { data, error } = await query;
  if (error) return describe("Recherche impossible", error);
  const rows = data as unknown as (ProductRow & { review_status: ReviewStatus })[];
  const products = rows.map((row) => ({ ...toProduct(row), pending: row.review_status === "pending" }));
  if (isValidGtin(barcode) || !needle) return ok(products.slice(0, 20));
  return ok(products.filter((p) => matchesQuery(`${p.name} ${p.brandName}`, needle)).slice(0, 20));
}

export async function getContributableProduct(client: SupabaseClient, id: string): Promise<ContributableProduct | null> {
  const { data } = await client.from("products").select(`${PRODUCT_COLUMNS},review_status`).eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as unknown as ProductRow & { review_status: ReviewStatus };
  return { ...toProduct(row), pending: row.review_status === "pending" };
}

export async function listContributableStores(client: SupabaseClient): Promise<Result<ContributableStore[]>> {
  const { data, error } = await client
    .from("stores")
    .select(`${STORE_COLUMNS},review_status`)
    .neq("review_status", "rejected")
    .order("city")
    .limit(1000);
  if (error) return describe("Lecture des magasins impossible", error);
  const rows = data as unknown as (StoreRow & { review_status: ReviewStatus })[];
  return ok(rows.map((row) => ({ ...toStore(row), pending: row.review_status === "pending" })));
}

// ───────────────────────── Envoi ─────────────────────────

export async function proposeProduct(client: SupabaseClient, product: NewProduct): Promise<Result<string>> {
  const { data, error } = await client.rpc("propose_product", {
    p_name: product.name,
    p_brand: product.brand,
    p_brand_type: product.brandType,
    p_category_id: product.categoryId,
    p_barcode: product.barcode,
    p_quantity_amount: product.amount,
    p_quantity_unit: product.unit,
    p_pack_count: product.packCount,
    p_uses_count: product.usesCount,
  });
  return error ? describe("Le produit n'a pas pu être enregistré", error) : ok(data as string);
}

export async function proposeStore(client: SupabaseClient, store: StoreDraft): Promise<Result<string>> {
  const { data, error } = await client.rpc("propose_store", {
    p_retailer: store.retailer || null,
    p_name: store.name,
    p_postal_code: store.postalCode,
    p_city: store.city,
  });
  return error ? describe("Le magasin n'a pas pu être enregistré", error) : ok(data as string);
}

export interface PriceSubmission {
  userId: string;
  productId: string;
  storeId: string;
  /** Quantité vendue, reprise de la fiche produit. */
  quantity: Product["quantity"];
  price: NewPrice;
  /** Photo déjà déposée (voir `uploadProof`) et ce qu'elle montre. */
  proof?: { path: string; kind: ProofKind };
}

/**
 * Enregistre un relevé en attente de validation. Avec une photo, il est
 * classé « ticket » ou « étiquette » ; sans photo, « signalement
 * communautaire » : la confiance affichée en tient compte. Si l'envoi échoue,
 * la photo déjà déposée est retirée.
 */
export async function submitPrice(client: SupabaseClient, submission: PriceSubmission): Promise<Result<string>> {
  const source = await client.from("data_sources").select("id").eq("slug", "contributions").single();
  const saved = source.error
    ? source
    : await client
        .from("price_observations")
        .insert({
          product_id: submission.productId,
          store_id: submission.storeId,
          observed_at: submission.price.observedAt,
          price_cents: submission.price.priceCents,
          quantity_amount: submission.quantity.amount,
          quantity_unit: submission.quantity.unit,
          pack_count: submission.quantity.packCount,
          uses_count: submission.quantity.usesCount ?? null,
          is_promo: submission.price.isPromo,
          promo_reference_price_cents: submission.price.referencePriceCents,
          promo_label: submission.price.promoLabel,
          source_id: source.data.id,
          method: submission.proof?.kind ?? "community_report",
          proof_path: submission.proof?.path ?? null,
          submitted_by: submission.userId,
        })
        .select("id")
        .single();
  if (saved.error) {
    if (submission.proof) await client.storage.from(PROOF_BUCKET).remove([submission.proof.path]);
    return describe("Le prix n'a pas pu être enregistré", saved.error);
  }
  return ok(saved.data.id as string);
}

// ───────────────────────── Preuves photo ─────────────────────────

export const PROOF_BUCKET = "proofs";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Ce que montre la photo jointe. */
export type ProofKind = "shelf_label" | "receipt";
export const proofKindLabel: Record<ProofKind, string> = {
  shelf_label: "Étiquette en rayon",
  receipt: "Ticket de caisse",
};

export function validateProof(byteLength: number, contentType: string): string | null {
  if (!PROOF_TYPES[contentType]) return "La photo doit être une image JPEG, PNG ou WebP.";
  if (byteLength === 0) return "La photo est vide.";
  if (byteLength > PROOF_MAX_BYTES) return "La photo dépasse 5 Mo. Reprenez-la en plus petit.";
  return null;
}

/**
 * Dépose une photo dans le dossier privé de l'utilisateur et renvoie son
 * chemin. Elle n'est lisible que par lui et par les modérateurs.
 */
export async function uploadProof(
  client: SupabaseClient,
  userId: string,
  data: Blob | ArrayBuffer,
  contentType: string,
): Promise<Result<string>> {
  const invalid = validateProof(data instanceof ArrayBuffer ? data.byteLength : data.size, contentType);
  if (invalid) return fail(invalid);
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${userId}/${name}.${PROOF_TYPES[contentType]}`;
  const { error } = await client.storage.from(PROOF_BUCKET).upload(path, data, { contentType, upsert: false });
  return error ? describe("La photo n'a pas pu être envoyée", error) : ok(path);
}

/** Lien temporaire (5 minutes) vers une preuve, pour son auteur ou un modérateur. */
export async function getProofUrl(client: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await client.storage.from(PROOF_BUCKET).createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

/** Supprime toutes les photos de l'utilisateur (avant la suppression du compte). */
export async function removeMyProofs(client: SupabaseClient, userId: string): Promise<boolean> {
  const bucket = client.storage.from(PROOF_BUCKET);
  for (;;) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) return false;
    if (data.length === 0) return true;
    const removed = await bucket.remove(data.map((file) => `${userId}/${file.name}`));
    if (removed.error) return false;
  }
}

// ───────────────────────── Suivi et modération ─────────────────────────

const SUBMISSION_COLUMNS =
  "id,observed_at,created_at,price_cents,is_promo,promo_reference_price_cents,promo_label,review_status,method,proof_path,quantity_amount,quantity_unit,pack_count,uses_count," +
  "products(name,barcode,review_status,brands(name),categories(name))," +
  "stores(name,city,postal_code,review_status,retailers(name))";

interface SubmissionRow {
  id: string;
  observed_at: string;
  created_at: string;
  price_cents: number;
  is_promo: boolean;
  promo_reference_price_cents: number | null;
  promo_label: string | null;
  review_status: ReviewStatus;
  method: CollectionMethod;
  proof_path: string | null;
  quantity_amount: number | string;
  quantity_unit: ContentUnit;
  pack_count: number;
  uses_count: number | null;
  products: { name: string; barcode: string | null; review_status: ReviewStatus; brands: { name: string } | null; categories: { name: string } | null } | null;
  stores: { name: string; city: string; postal_code: string; review_status: ReviewStatus; retailers: { name: string } | null } | null;
}

export interface Submission {
  id: string;
  observedAt: string;
  createdAt: string;
  priceCents: number;
  isPromo: boolean;
  referencePriceCents: number | null;
  promoLabel: string | null;
  status: ReviewStatus;
  method: CollectionMethod;
  /** Chemin de la photo jointe, s'il y en a une (voir `getProofUrl`). */
  proofPath: string | null;
  quantity: Product["quantity"];
  productName: string;
  brandName: string | null;
  categoryName: string | null;
  barcode: string | null;
  /** Le produit ou le magasin a été proposé avec ce relevé et n'est pas encore publié. */
  newProduct: boolean;
  newStore: boolean;
  storeLabel: string;
}

export function toSubmission(row: SubmissionRow): Submission {
  const store = row.stores;
  return {
    id: row.id,
    observedAt: new Date(row.observed_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    priceCents: row.price_cents,
    isPromo: row.is_promo,
    referencePriceCents: row.promo_reference_price_cents,
    promoLabel: row.promo_label,
    status: row.review_status,
    method: row.method,
    proofPath: row.proof_path,
    quantity: {
      amount: Number(row.quantity_amount),
      unit: row.quantity_unit,
      packCount: row.pack_count,
      ...(row.uses_count ? { usesCount: row.uses_count } : {}),
    },
    productName: row.products?.name ?? "Produit indisponible",
    brandName: row.products?.brands?.name ?? null,
    categoryName: row.products?.categories?.name ?? null,
    barcode: row.products?.barcode ?? null,
    newProduct: row.products?.review_status === "pending",
    newStore: store?.review_status === "pending",
    storeLabel: store
      ? `${store.retailers ? `${store.retailers.name} — ` : ""}${store.name}, ${store.postal_code} ${store.city}`
      : "Magasin indisponible",
  };
}

async function readSubmissions(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Result<Submission[]>> {
  const { data, error } = await query;
  if (error) return describe("Lecture impossible", error);
  return ok((data as SubmissionRow[]).map(toSubmission));
}

/** Les cinquante derniers envois de l'utilisateur, avec leur état. */
export function listMySubmissions(client: SupabaseClient, userId: string): Promise<Result<Submission[]>> {
  return readSubmissions(
    client.from("price_observations").select(SUBMISSION_COLUMNS).eq("submitted_by", userId).order("created_at", { ascending: false }).limit(50),
  );
}

export async function isModerator(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc("is_moderator");
  return !error && data === true;
}

/** File d'attente de modération, du plus ancien au plus récent. */
export function listPendingSubmissions(client: SupabaseClient): Promise<Result<Submission[]>> {
  return readSubmissions(
    client.from("price_observations").select(SUBMISSION_COLUMNS).eq("review_status", "pending").order("created_at").limit(100),
  );
}

export async function reviewSubmission(client: SupabaseClient, id: string, accept: boolean): Promise<Result<null>> {
  const { error } = await client.rpc("review_observation", { p_id: id, p_accept: accept });
  if (!error) return ok(null);
  if (/déjà traité/.test(error.message)) return fail("Ce relevé a déjà été traité.");
  if (/modérateurs/.test(error.message)) return fail("Cette action est réservée aux modérateurs.");
  return describe("La décision n'a pas pu être enregistrée", error);
}

import { isValidGtin, matchesQuery, type CatalogRepository } from "@lvp/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CATEGORY_COLUMNS,
  OBSERVATION_COLUMNS,
  PRODUCT_COLUMNS,
  SOURCE_COLUMNS,
  STORE_COLUMNS,
  toCategory,
  toObservation,
  toProduct,
  toSource,
  toStore,
  type CategoryRow,
  type ObservationRow,
  type ProductRow,
  type SourceRow,
  type StoreRow,
} from "./rows";

export * from "./auth";
export * from "./contributions";
export * from "./personal";
export * from "./openfacts";
export * from "./rows";

export interface SupabaseConfig {
  url: string;
  /** Clé PUBLIQUE uniquement (« publishable » / « anon »). Jamais la clé de service. */
  publicKey: string;
}

/**
 * Lit la configuration publique. Renvoie null si elle est absente : les
 * applications retombent alors sur le jeu de démonstration, sans erreur.
 */
export function readSupabaseConfig(url: string | undefined, publicKey: string | undefined): SupabaseConfig | null {
  if (!url || !publicKey) return null;
  if (/service_role|^sb_secret_/.test(publicKey)) {
    throw new Error("Une clé secrète Supabase a été fournie à une application cliente : utilisez la clé publique.");
  }
  return { url, publicKey };
}

/** Client sans session : lecture publique du catalogue (mode découverte). */
export function createPublicClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.publicKey, {
    // Clé de stockage distincte : ce client ne doit jamais partager la session du client connecté.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "lvp-public" },
  });
}

/** Historique chargé pour une fiche : couvre la fenêtre « prix habituel » (90 j) avec de la marge. */
const HISTORY_DAYS = 180;
const MAX_ROWS = 1000;

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Lecture ${what} impossible : ${result.error.message}`);
  return result.data as T;
}

/**
 * Catalogue réel servi par Supabase. Les règles RLS garantissent que seules
 * les observations validées sont lisibles avec la clé publique.
 */
export function createSupabaseCatalog(client: SupabaseClient, now: Date = new Date()): CatalogRepository {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  return {
    dataset: { kind: "live", label: "Prix relevés" },

    async listCategories() {
      const rows = unwrap(await client.from("categories").select(CATEGORY_COLUMNS).order("name"), "des catégories");
      return (rows as unknown as CategoryRow[]).map(toCategory);
    },

    async listStores() {
      const rows = unwrap(await client.from("stores").select(STORE_COLUMNS).limit(MAX_ROWS), "des magasins");
      return (rows as unknown as StoreRow[]).map(toStore);
    },

    async listSources() {
      const rows = unwrap(await client.from("data_sources").select(SOURCE_COLUMNS), "des sources");
      return (rows as unknown as SourceRow[]).map(toSource);
    },

    // Le filtrage texte se fait ici avec la même règle que partout ailleurs
    // (insensible aux accents). À remplacer par une recherche plein texte
    // PostgreSQL quand le catalogue dépassera quelques milliers de produits.
    async searchProducts({ text, categoryId }) {
      let query = client.from("products").select(PRODUCT_COLUMNS).order("name").limit(MAX_ROWS);
      if (categoryId) query = query.eq("category_id", categoryId);
      const products = (unwrap(await query, "des produits") as unknown as ProductRow[]).map(toProduct);
      const needle = text?.trim();
      return needle ? products.filter((p) => matchesQuery(`${p.name} ${p.brandName}`, needle)) : products;
    },

    async getProduct(id) {
      const row = unwrap(
        await client.from("products").select(PRODUCT_COLUMNS).eq("id", id).maybeSingle(),
        "du produit",
      );
      return row ? toProduct(row as unknown as ProductRow) : null;
    },

    async getProductByBarcode(barcode) {
      if (!isValidGtin(barcode)) return null;
      const row = unwrap(
        await client.from("products").select(PRODUCT_COLUMNS).eq("barcode", barcode).maybeSingle(),
        "du produit",
      );
      return row ? toProduct(row as unknown as ProductRow) : null;
    },

    async listObservations(productId) {
      const rows = unwrap(
        await client
          .from("price_observations")
          .select(OBSERVATION_COLUMNS)
          .eq("product_id", productId)
          .eq("review_status", "accepted")
          .gte("observed_at", since)
          .order("observed_at")
          .limit(MAX_ROWS),
        "des prix",
      );
      return (rows as unknown as ObservationRow[]).map(toObservation);
    },
  };
}

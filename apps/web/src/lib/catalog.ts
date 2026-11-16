import {
  buildProductView,
  type CatalogRepository,
  type Category,
  type Offer,
  type Product,
  type ProductView,
} from "@lvp/core";
import { createPublicClient, createSupabaseCatalog, readSupabaseConfig } from "@lvp/data-supabase";
import { createDemoCatalog } from "@lvp/demo-data";
import { cacheLife, cacheTag } from "next/cache";

/** Étiquette de cache du catalogue : invalidée quand un relevé est publié. */
export const CATALOG_TAG = "catalog";

/**
 * Point d'entrée unique vers les données du catalogue.
 *
 * Si NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_KEY sont définies, le
 * site lit la base réelle ; sinon il sert le jeu de démonstration fictif.
 * Les deux ne sont jamais mélangés.
 */
function getRepository(now: Date): CatalogRepository {
  const config = readSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_KEY,
  );
  return config ? createSupabaseCatalog(createPublicClient(config), now) : createDemoCatalog(now);
}

export interface CatalogSnapshot {
  /** Instant auquel les statuts (confirmé, ancien…) ont été calculés. */
  asOf: string;
  dataset: CatalogRepository["dataset"];
  categories: Category[];
  products: Product[];
  views: ProductView[];
}

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const now = new Date();
  const repo = getRepository(now);
  const [categories, stores, products] = await Promise.all([
    repo.listCategories(),
    repo.listStores(),
    repo.searchProducts({}),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const views = await Promise.all(
    products.map(async (product) =>
      buildProductView(
        product,
        categoryById.get(product.categoryId)!,
        stores,
        await repo.listObservations(product.id),
        now,
      ),
    ),
  );
  return { asOf: now.toISOString(), dataset: repo.dataset, categories, products, views };
}

export async function searchProducts(text: string, categorySlug?: string): Promise<ProductView[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const snapshot = await getCatalogSnapshot();
  const category = snapshot.categories.find((c) => c.slug === categorySlug);
  const repo = getRepository(new Date(snapshot.asOf));
  const found = await repo.searchProducts({ text, categoryId: category?.id });
  const ids = new Set(found.map((p) => p.id));
  return snapshot.views.filter((v) => ids.has(v.product.id));
}

/** Offres signalées par l'analyse (toutes enseignes confondues). */
export function offersByVerdict(views: ProductView[], verdict: Offer["assessment"]["verdict"]): Offer[] {
  return views
    .flatMap((v) => [...v.ranked, ...v.unranked])
    .filter((o) => o.assessment.verdict === verdict && o.status !== "historical");
}

/** Produits de la même catégorie, comparables sur la même base, du moins cher au plus cher. */
export function comparableAlternatives(views: ProductView[], current: ProductView): ProductView[] {
  const basis = current.best?.unitPrice?.basis;
  if (!basis) return [];
  return views
    .filter(
      (v) =>
        v.product.id !== current.product.id &&
        v.category.id === current.category.id &&
        v.best?.unitPrice?.basis === basis,
    )
    .sort((a, b) => a.best!.unitPrice!.cents - b.best!.unitPrice!.cents);
}

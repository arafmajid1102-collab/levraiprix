import type { Category, DataSource, PriceObservation, Product, Store } from "@lvp/core";

/**
 * Formes des lignes renvoyées par l'API Supabase (colonnes des migrations) et
 * conversion vers le modèle de domaine. Fonctions pures, testées sans réseau.
 */

export const CATEGORY_COLUMNS = "id,slug,name,parent_id,comparison_basis,fallback_basis";
export const PRODUCT_COLUMNS =
  "id,name,category_id,barcode,quantity_amount,quantity_unit,pack_count,uses_count,packaging,image_path,brands(name,brand_type)";
export const STORE_COLUMNS = "id,name,postal_code,city,latitude,longitude,retailers(name)";
export const SOURCE_COLUMNS = "id,name,license";
export const OBSERVATION_COLUMNS =
  "id,product_id,store_id,observed_at,price_cents,quantity_amount,quantity_unit,pack_count,uses_count,is_promo,promo_reference_price_cents,promo_label,source_id,method,confirmations";

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  comparison_basis: Category["comparisonBasis"];
  fallback_basis: Category["comparisonBasis"] | null;
}

export interface ProductRow {
  id: string;
  name: string;
  category_id: string;
  barcode: string | null;
  quantity_amount: number | string;
  quantity_unit: Product["quantity"]["unit"];
  pack_count: number;
  uses_count: number | null;
  packaging: string | null;
  image_path: string | null;
  brands: { name: string; brand_type: Product["brandType"] } | null;
}

export interface StoreRow {
  id: string;
  name: string;
  postal_code: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  retailers: { name: string } | null;
}

export interface SourceRow {
  id: string;
  name: string;
  license: string | null;
}

export interface ObservationRow {
  id: string;
  product_id: string;
  store_id: string;
  observed_at: string;
  price_cents: number;
  quantity_amount: number | string;
  quantity_unit: Product["quantity"]["unit"];
  pack_count: number;
  uses_count: number | null;
  is_promo: boolean;
  promo_reference_price_cents: number | null;
  promo_label: string | null;
  source_id: string;
  method: PriceObservation["method"];
  confirmations: number;
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
    comparisonBasis: row.comparison_basis,
    ...(row.fallback_basis ? { fallbackBasis: row.fallback_basis } : {}),
  };
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brands?.name ?? "Marque non renseignée",
    brandType: row.brands?.brand_type ?? "national",
    categoryId: row.category_id,
    ...(row.barcode ? { barcode: row.barcode } : {}),
    quantity: {
      amount: Number(row.quantity_amount),
      unit: row.quantity_unit,
      packCount: row.pack_count,
      ...(row.uses_count ? { usesCount: row.uses_count } : {}),
    },
    ...(row.packaging ? { packaging: row.packaging } : {}),
  };
}

export function toStore(row: StoreRow): Store {
  return {
    id: row.id,
    retailerName: row.retailers?.name ?? "Indépendant",
    name: row.name,
    city: row.city,
    postalCode: row.postal_code,
    ...(row.latitude !== null && row.longitude !== null
      ? { latitude: row.latitude, longitude: row.longitude }
      : {}),
  };
}

export function toSource(row: SourceRow): DataSource {
  return { id: row.id, name: row.name, isDemo: false, ...(row.license ? { license: row.license } : {}) };
}

export function toObservation(row: ObservationRow): PriceObservation {
  return {
    id: row.id,
    productId: row.product_id,
    storeId: row.store_id,
    observedAt: new Date(row.observed_at).toISOString(),
    priceCents: row.price_cents,
    quantity: {
      amount: Number(row.quantity_amount),
      unit: row.quantity_unit,
      packCount: row.pack_count,
      ...(row.uses_count ? { usesCount: row.uses_count } : {}),
    },
    ...(row.is_promo
      ? {
          promo: {
            ...(row.promo_reference_price_cents
              ? { claimedReferencePriceCents: row.promo_reference_price_cents }
              : {}),
            ...(row.promo_label ? { label: row.promo_label } : {}),
          },
        }
      : {}),
    sourceId: row.source_id,
    method: row.method,
    confirmations: row.confirmations,
  };
}

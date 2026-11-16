/**
 * Modèle de domaine partagé (web, mobile, serveur).
 * Les montants sont des entiers en centimes d'euro : jamais de flottants pour un prix affiché.
 */

/** Base de comparaison propre à chaque famille de produits. */
export type ComparisonBasis = "per_wash" | "per_litre" | "per_kg" | "per_unit";

export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId?: string;
  /** Unité qui rend réellement service au consommateur (lavage, litre, sac…). */
  comparisonBasis: ComparisonBasis;
  /** Utilisée quand la donnée nécessaire à `comparisonBasis` manque. */
  fallbackBasis?: ComparisonBasis;
}

export type ContentUnit = "ml" | "l" | "g" | "kg" | "unit";

/** Quantité vendue : `packCount` articles identiques contenant chacun `amount` `unit`. */
export interface Quantity {
  amount: number;
  unit: ContentUnit;
  packCount: number;
  /** Nombre d'utilisations par article (ex. lavages), si le fabricant l'indique. */
  usesCount?: number;
}

export type BrandType = "national" | "private_label";

export interface Product {
  id: string;
  name: string;
  brandName: string;
  brandType: BrandType;
  categoryId: string;
  /** Code-barres EAN/GTIN, s'il est connu. */
  barcode?: string;
  quantity: Quantity;
  /** Libellé de conditionnement lisible (« Bidon 1,5 L », « Lot de 3 »…). */
  packaging?: string;
  imageUrl?: string;
}

export interface Store {
  id: string;
  retailerName: string;
  name: string;
  city: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
}

/** Comment l'observation a été collectée. */
export type CollectionMethod =
  | "receipt" // ticket de caisse
  | "shelf_label" // photo d'étiquette en rayon
  | "retailer_feed" // flux officiel d'un distributeur
  | "community_report" // signalement communautaire sans preuve jointe
  | "manual_entry" // saisie manuelle
  | "model_estimate"; // estimation calculée — n'est PAS un prix constaté

export interface DataSource {
  id: string;
  name: string;
  /** Les données de démonstration ne doivent jamais se mélanger aux observations réelles. */
  isDemo: boolean;
  license?: string;
}

export interface PriceObservation {
  id: string;
  productId: string;
  storeId: string;
  /** Date ISO 8601 de l'observation. */
  observedAt: string;
  /** Prix affiché pour le conditionnement entier, en centimes. */
  priceCents: number;
  /** Quantité vendue au moment de l'observation (permet de détecter la réduflation). */
  quantity: Quantity;
  /** Renseigné si le prix était présenté comme promotionnel. */
  promo?: {
    /** Prix de référence (« prix barré ») annoncé par le magasin. */
    claimedReferencePriceCents?: number;
    label?: string;
  };
  sourceId: string;
  method: CollectionMethod;
  /** Nombre de confirmations indépendantes. */
  confirmations: number;
}

/**
 * Les quatre natures de prix que l'interface doit toujours distinguer.
 * - confirmed  : constaté très récemment par une méthode fiable ou recoupé
 * - observed   : réellement constaté, encore récent
 * - historical : réellement constaté, mais ancien
 * - estimated  : calculé, jamais constaté
 */
export type PriceStatus = "confirmed" | "observed" | "historical" | "estimated";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface Confidence {
  /** Entre 0 et 1. */
  score: number;
  level: ConfidenceLevel;
}

export interface UnitPrice {
  basis: ComparisonBasis;
  /** Centimes par unité de comparaison (valeur fractionnaire). */
  cents: number;
}

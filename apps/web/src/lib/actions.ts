"use server";

import { updateTag } from "next/cache";
import type { ProductView } from "@lvp/core";
import { lookupOpenFacts, type ProductSuggestion } from "@lvp/data-supabase";
import { CATALOG_TAG, getCatalogSnapshot } from "./catalog";

/**
 * Fait relire le catalogue après la publication d'un relevé. Ne modifie
 * aucune donnée et n'exige donc aucun droit : au pire, le cache est recalculé.
 */
export async function refreshCatalog(): Promise<void> {
  updateTag(CATALOG_TAG);
}

/**
 * Fiches publiques des produits demandés (pour afficher les favoris). Ne lit
 * que le catalogue public : la liste des favoris, elle, reste dans le
 * navigateur de l'utilisateur et n'est jamais enregistrée ici.
 */
export async function getProductViews(ids: string[]): Promise<{ asOf: string; views: ProductView[] }> {
  const wanted = new Set(ids.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)).slice(0, 200));
  const { asOf, views } = await getCatalogSnapshot();
  return { asOf, views: views.filter((view) => wanted.has(view.product.id)) };
}

/** Identifiant du produit publié portant ce code-barres, s'il existe. */
export async function findProductIdByBarcode(barcode: string): Promise<string | null> {
  if (typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode)) return null;
  const { products } = await getCatalogSnapshot();
  return products.find((product) => product.barcode === barcode)?.id ?? null;
}

/**
 * Fiche proposée pour un code-barres, lue dans les bases ouvertes Open Products
 * Facts / Open Food Facts. L'appel part du serveur : l'adresse de l'utilisateur
 * n'est pas transmise à ces services. Un appel par demande de l'utilisateur.
 */
export async function suggestProduct(barcode: string): Promise<ProductSuggestion | null> {
  if (typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode)) return null;
  return lookupOpenFacts(barcode, { userAgent: "LeVraiPrix/0.1 (web)" });
}

/**
 * Fiche produit proposée à partir du code-barres, lue dans les bases ouvertes
 * Open Products Facts (produits non alimentaires) et Open Food Facts.
 *
 * - Données sous licence ODbL : la source est toujours citée à l'écran.
 * - Règle d'usage de ces bases : un appel = un vrai scan d'un utilisateur.
 *   Ne jamais s'en servir pour parcourir ou aspirer le catalogue.
 * - Ce sont des PROPOSITIONS saisies par des bénévoles, parfois fausses :
 *   elles préremplissent le formulaire, l'utilisateur vérifie sur l'emballage.
 *   Aucun prix n'est lu ici.
 */
import { isValidGtin, normalizeBarcode, type ContentUnit } from "@lvp/core";
import type { ProductDraft } from "./contributions";

export type OpenFactsSource = "open-products-facts" | "open-food-facts";

const SOURCES: { id: OpenFactsSource; label: string; host: string }[] = [
  { id: "open-products-facts", label: "Open Products Facts", host: "world.openproductsfacts.org" },
  { id: "open-food-facts", label: "Open Food Facts", host: "world.openfoodfacts.org" },
];

const FIELDS = "code,product_name,product_name_fr,brands,quantity,product_quantity,product_quantity_unit";

export interface ProductSuggestion {
  source: OpenFactsSource;
  /** Nom à afficher pour citer la source. */
  sourceLabel: string;
  /** Page publique de la fiche d'origine. */
  url: string;
  barcode: string;
  name: string;
  brand: string;
  /** Contenance au format de saisie (« 1,5 »), ou vide si elle n'est pas fiable. */
  amount: string;
  unit: ContentUnit | null;
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const toInput = (value: number) => String(Math.round(value * 1000) / 1000).replace(".", ",");

const UNITS: Record<string, { unit: ContentUnit; factor: number }> = {
  l: { unit: "l", factor: 1 },
  litre: { unit: "l", factor: 1 },
  litres: { unit: "l", factor: 1 },
  cl: { unit: "ml", factor: 10 },
  ml: { unit: "ml", factor: 1 },
  kg: { unit: "kg", factor: 1 },
  g: { unit: "g", factor: 1 },
};

/**
 * « 1,5 L », « 400 g e », « 0.528 kg » → contenance. Tout le reste (lots
 * « 3 x 1 L », saisies douteuses comme « 2 ,15 L ») est refusé : mieux vaut
 * un champ vide qu'une contenance fausse, car elle fausserait le prix au litre.
 */
export function parseQuantityText(text: string): { amount: string; unit: ContentUnit } | null {
  const match = /^(\d{1,5}(?:[.,]\d{1,3})?) ?([a-z]+)(?: e)?$/.exec(text.trim().toLowerCase());
  if (!match) return null;
  const known = UNITS[match[2]!];
  const value = Number(match[1]!.replace(",", ".")) * (known?.factor ?? 0);
  return known && value > 0 ? { amount: toInput(value), unit: known.unit } : null;
}

/** Transforme la réponse brute d'une des deux bases en proposition, ou null si elle est inexploitable. */
export function parseOpenFactsProduct(payload: unknown, source: OpenFactsSource, barcode: string): ProductSuggestion | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { status, product } = payload as { status?: unknown; product?: Record<string, unknown> };
  if (status !== 1 || typeof product !== "object" || product === null) return null;

  const name = clean(product.product_name_fr, 200) || clean(product.product_name, 200);
  // Plusieurs marques séparées par des virgules : la première est la principale.
  const brand = clean(clean(product.brands, 400).split(",")[0], 80);
  if (!name && !brand) return null;

  const text = clean(product.quantity, 40);
  const quantity = text
    ? parseQuantityText(text)
    : typeof product.product_quantity === "number" && typeof product.product_quantity_unit === "string"
      ? parseQuantityText(`${product.product_quantity} ${product.product_quantity_unit}`)
      : null;

  const { label, host } = SOURCES.find((s) => s.id === source)!;
  return {
    source,
    sourceLabel: label,
    url: `https://${host}/product/${barcode}`,
    barcode,
    name,
    brand,
    amount: quantity?.amount ?? "",
    unit: quantity?.unit ?? null,
  };
}

/**
 * Préremplit le brouillon avec la proposition, sans jamais écraser ce que
 * l'utilisateur a déjà saisi. Catégorie et type de marque restent à choisir.
 */
export function applySuggestion(draft: ProductDraft, suggestion: ProductSuggestion): ProductDraft {
  const keepAmount = draft.amount.trim() !== "" || !suggestion.unit;
  return {
    ...draft,
    name: draft.name.trim() || suggestion.name,
    brand: draft.brand.trim() || suggestion.brand,
    amount: keepAmount ? draft.amount : suggestion.amount,
    unit: keepAmount ? draft.unit : suggestion.unit!,
  };
}

/**
 * Codes « à usage interne » (EAN-13 commençant par 2, EAN-8 par 0 ou 2) : chaque
 * magasin les attribue librement (fruits au poids, rayon coupe…). Le même code
 * désigne donc des produits sans rapport d'un magasin à l'autre : une fiche
 * trouvée en ligne serait presque toujours celle d'un autre produit.
 */
export function isStoreInternalCode(barcode: string): boolean {
  return (barcode.length === 13 && barcode[0] === "2") || (barcode.length === 8 && (barcode[0] === "0" || barcode[0] === "2"));
}

export interface LookupOptions {
  fetch?: typeof fetch;
  /** Identifie l'application auprès des bases ouvertes (ignoré par les navigateurs). */
  userAgent?: string;
  timeoutMs?: number;
}

/**
 * Cherche le code-barres dans les bases ouvertes : d'abord les produits non
 * alimentaires, puis l'alimentaire. Deux appels au plus, pour un scan.
 * Ne lève jamais : toute panne ou absence renvoie null, et la saisie reste manuelle.
 */
export async function lookupOpenFacts(rawBarcode: string, options: LookupOptions = {}): Promise<ProductSuggestion | null> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode || !isValidGtin(barcode) || isStoreInternalCode(barcode)) return null;
  const doFetch = options.fetch ?? fetch;
  for (const { id, host } of SOURCES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
    try {
      const response = await doFetch(`https://${host}/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
        headers: { Accept: "application/json", ...(options.userAgent ? { "User-Agent": options.userAgent } : {}) },
        signal: controller.signal,
      });
      if (response.ok) {
        const suggestion = parseOpenFactsProduct(await response.json(), id, barcode);
        if (suggestion) return suggestion;
      }
    } catch {
      // Base injoignable ou trop lente : on essaie la suivante, puis on renonce.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

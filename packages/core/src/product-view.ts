import { assessOffer, type OfferAssessment } from "./promo";
import { classifyPriceStatus, computeConfidence } from "./reliability";
import type {
  Category,
  Confidence,
  PriceObservation,
  PriceStatus,
  Product,
  Store,
  UnitPrice,
} from "./types";
import { resolveUnitPrice } from "./units";

/** Dernier prix connu d'un produit dans un magasin, prêt à afficher. */
export interface Offer {
  product: Product;
  store: Store;
  observation: PriceObservation;
  status: PriceStatus;
  confidence: Confidence;
  unitPrice: UnitPrice | null;
  assessment: OfferAssessment;
}

export interface HistoryPoint {
  observedAt: string;
  priceCents: number;
  unitPriceCents: number | null;
  status: PriceStatus;
  isPromo: boolean;
}

export interface ProductView {
  product: Product;
  category: Category;
  /** Offres réellement constatées et récentes, de la moins chère à la plus chère (prix unitaire). */
  ranked: Offer[];
  /** Offres hors classement : anciennes, estimées ou sans prix unitaire comparable. */
  unranked: Offer[];
  best: Offer | null;
  /** Historique par magasin, du plus ancien au plus récent. */
  history: { store: Store; points: HistoryPoint[] }[];
}

const byDate = (a: PriceObservation, b: PriceObservation) =>
  new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime();

/**
 * Assemble la fiche d'un produit. Le classement objectif ne retient que des prix
 * constatés et encore récents, comparés sur la même base ; rien d'autre
 * (sponsoring, estimation) ne peut y modifier une position.
 */
export function buildProductView(
  product: Product,
  category: Category,
  stores: Store[],
  observations: PriceObservation[],
  now: Date,
): ProductView {
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const byStore = new Map<string, PriceObservation[]>();
  for (const o of observations) {
    if (o.productId !== product.id || !storeById.has(o.storeId)) continue;
    if (new Date(o.observedAt).getTime() > now.getTime()) continue;
    const list = byStore.get(o.storeId) ?? [];
    list.push(o);
    byStore.set(o.storeId, list);
  }

  const offers: Offer[] = [];
  const history: ProductView["history"] = [];
  for (const [storeId, list] of byStore) {
    list.sort(byDate);
    const store = storeById.get(storeId)!;
    const latest = list[list.length - 1]!;
    offers.push({
      product,
      store,
      observation: latest,
      status: classifyPriceStatus(latest, now),
      confidence: computeConfidence(latest, now),
      unitPrice: resolveUnitPrice(latest.priceCents, latest.quantity, category),
      assessment: assessOffer(latest, list, category),
    });
    history.push({
      store,
      points: list.map((o) => ({
        observedAt: o.observedAt,
        priceCents: o.priceCents,
        unitPriceCents: resolveUnitPrice(o.priceCents, o.quantity, category)?.cents ?? null,
        status: classifyPriceStatus(o, now),
        isPromo: Boolean(o.promo),
      })),
    });
  }

  const current = offers.filter(
    (o) => (o.status === "confirmed" || o.status === "observed") && o.unitPrice,
  );
  // On ne classe ensemble que des prix exprimés sur la même base.
  const basis = current.some((o) => o.unitPrice!.basis === category.comparisonBasis)
    ? category.comparisonBasis
    : category.fallbackBasis;
  const ranked = current
    .filter((o) => o.unitPrice!.basis === basis)
    .sort((a, b) => a.unitPrice!.cents - b.unitPrice!.cents || a.store.name.localeCompare(b.store.name));
  const unranked = offers
    .filter((o) => !ranked.includes(o))
    .sort((a, b) => byDate(b.observation, a.observation));
  history.sort((a, b) => a.store.name.localeCompare(b.store.name));

  return { product, category, ranked, unranked, best: ranked[0] ?? null, history };
}

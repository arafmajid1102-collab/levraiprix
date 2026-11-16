/**
 * JEU DE DONNÉES DE DÉMONSTRATION — ENTIÈREMENT FICTIF.
 *
 * Marques, magasins, codes-barres et prix sont inventés. Ils servent à
 * développer et tester l'interface et les calculs, et ne décrivent aucun
 * commerce ni produit réel. Ce jeu n'est jamais inséré dans la base réelle :
 * il vit dans ce package et s'annonce via `dataset.kind === "demo"`.
 *
 * Les dates sont générées relativement à `now` pour que les scénarios
 * (prix confirmé, ancien, promotion trompeuse…) restent valables dans le temps.
 */
import {
  matchesQuery,
  type CatalogRepository,
  type Category,
  type CollectionMethod,
  type DataSource,
  type PriceObservation,
  type Product,
  type Quantity,
  type Store,
} from "@lvp/core";

export const DEMO_SOURCE: DataSource = {
  id: "demo-source",
  name: "Jeu de démonstration (fictif)",
  isDemo: true,
};

export const demoCategories: Category[] = [
  { id: "cat-lessives", slug: "lessives", name: "Lessives", comparisonBasis: "per_wash", fallbackBasis: "per_litre" },
  { id: "cat-vaisselle", slug: "liquides-vaisselle", name: "Liquides vaisselle", comparisonBasis: "per_litre" },
  { id: "cat-menagers", slug: "produits-menagers", name: "Produits ménagers", comparisonBasis: "per_litre" },
  { id: "cat-sols", slug: "nettoyants-sols", name: "Nettoyants pour sols", comparisonBasis: "per_litre" },
  { id: "cat-sdb", slug: "salle-de-bain", name: "Salle de bain", comparisonBasis: "per_litre" },
  { id: "cat-desinfectants", slug: "desinfectants", name: "Désinfectants", comparisonBasis: "per_litre" },
  { id: "cat-eponges", slug: "eponges-accessoires", name: "Éponges et accessoires", comparisonBasis: "per_unit" },
  { id: "cat-sacs", slug: "sacs-poubelle", name: "Sacs-poubelle", comparisonBasis: "per_unit" },
  { id: "cat-specialises", slug: "entretien-specialise", name: "Entretien spécialisé", comparisonBasis: "per_litre" },
];

export const demoStores: Store[] = [
  { id: "store-a", retailerName: "Enseigne fictive A", name: "Hyper fictif A — Centre", city: "Ville-Démo", postalCode: "00000" },
  { id: "store-b", retailerName: "Enseigne fictive B", name: "Super fictif B — Gare", city: "Ville-Démo", postalCode: "00000" },
  { id: "store-c", retailerName: "Enseigne fictive C", name: "Discount fictif C — Nord", city: "Ville-Démo", postalCode: "00000" },
  { id: "store-d", retailerName: "Enseigne fictive D", name: "Proxi fictif D — Mairie", city: "Ville-Démo", postalCode: "00000" },
];

/** Code interne (préfixe 20, réservé aux usages en magasin) avec clé de contrôle valide. */
function demoBarcode(n: number): string {
  const body = `20000000${String(n).padStart(4, "0")}`;
  const sum = [...body].reverse().reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return body + String((10 - (sum % 10)) % 10);
}

type Scenario =
  | "stable"
  | "real_promo"
  | "fake_reference"
  | "inflated_then_promo"
  | "shrinkflation"
  | "stale"
  | "estimate_only"
  | "community";

interface Listing {
  storeId: string;
  baseCents: number;
  scenario: Scenario;
}

interface Seed {
  product: Product;
  listings: Listing[];
}

let productSeq = 0;
function product(
  name: string,
  brandName: string,
  brandType: Product["brandType"],
  categoryId: string,
  quantity: Quantity,
  packaging: string,
): Product {
  productSeq += 1;
  return {
    id: `demo-p${productSeq}`,
    name,
    brandName,
    brandType,
    categoryId,
    barcode: demoBarcode(productSeq),
    quantity,
    packaging,
  };
}

const AZUR = "Azur (marque fictive)";
const CEDRE = "Cèdre (marque fictive)";
const MDD_A = "Sélection A (MDD fictive)";
const MDD_C = "Prix C (MDD fictive)";

const seeds: Seed[] = [
  {
    product: product("Lessive liquide fraîcheur — 30 lavages", AZUR, "national", "cat-lessives", { amount: 1.5, unit: "l", packCount: 1, usesCount: 30 }, "Bidon 1,5 L"),
    listings: [
      { storeId: "store-a", baseCents: 899, scenario: "fake_reference" },
      { storeId: "store-b", baseCents: 949, scenario: "real_promo" },
      { storeId: "store-c", baseCents: 879, scenario: "stable" },
      { storeId: "store-d", baseCents: 1049, scenario: "stale" },
    ],
  },
  {
    product: product("Lessive liquide fraîcheur — lot 2 × 30 lavages", AZUR, "national", "cat-lessives", { amount: 1.5, unit: "l", packCount: 2, usesCount: 30 }, "Lot de 2 bidons 1,5 L"),
    listings: [
      { storeId: "store-a", baseCents: 1890, scenario: "stable" },
      { storeId: "store-b", baseCents: 1750, scenario: "stable" },
    ],
  },
  {
    product: product("Lessive liquide universelle — 40 lavages", MDD_A, "private_label", "cat-lessives", { amount: 2, unit: "l", packCount: 1, usesCount: 40 }, "Bidon 2 L"),
    listings: [
      { storeId: "store-a", baseCents: 599, scenario: "stable" },
      { storeId: "store-d", baseCents: 615, scenario: "estimate_only" },
    ],
  },
  {
    product: product("Lessive capsules — 26 lavages", CEDRE, "national", "cat-lessives", { amount: 26, unit: "unit", packCount: 1, usesCount: 26 }, "Boîte de 26 capsules"),
    listings: [
      { storeId: "store-a", baseCents: 989, scenario: "inflated_then_promo" },
      { storeId: "store-b", baseCents: 969, scenario: "stable" },
      { storeId: "store-c", baseCents: 929, scenario: "community" },
    ],
  },
  {
    product: product("Liquide vaisselle citron", CEDRE, "national", "cat-vaisselle", { amount: 500, unit: "ml", packCount: 1 }, "Flacon 500 ml"),
    listings: [
      { storeId: "store-a", baseCents: 215, scenario: "shrinkflation" },
      { storeId: "store-b", baseCents: 229, scenario: "stable" },
      { storeId: "store-c", baseCents: 199, scenario: "stable" },
    ],
  },
  {
    product: product("Liquide vaisselle concentré", MDD_C, "private_label", "cat-vaisselle", { amount: 750, unit: "ml", packCount: 1 }, "Flacon 750 ml"),
    listings: [
      { storeId: "store-c", baseCents: 135, scenario: "stable" },
    ],
  },
  {
    product: product("Nettoyant multi-usages agrumes", AZUR, "national", "cat-menagers", { amount: 750, unit: "ml", packCount: 1 }, "Spray 750 ml"),
    listings: [
      { storeId: "store-a", baseCents: 289, scenario: "stable" },
      { storeId: "store-b", baseCents: 305, scenario: "real_promo" },
      { storeId: "store-d", baseCents: 345, scenario: "community" },
    ],
  },
  {
    product: product("Nettoyant sols pin", MDD_A, "private_label", "cat-sols", { amount: 1.25, unit: "l", packCount: 1 }, "Bouteille 1,25 L"),
    listings: [
      { storeId: "store-a", baseCents: 179, scenario: "stable" },
      { storeId: "store-c", baseCents: 169, scenario: "stale" },
    ],
  },
  {
    product: product("Gel WC détartrant", CEDRE, "national", "cat-sdb", { amount: 750, unit: "ml", packCount: 1 }, "Flacon 750 ml"),
    listings: [
      { storeId: "store-a", baseCents: 245, scenario: "stable" },
      { storeId: "store-b", baseCents: 239, scenario: "fake_reference" },
    ],
  },
  {
    product: product("Spray désinfectant surfaces", AZUR, "national", "cat-desinfectants", { amount: 500, unit: "ml", packCount: 1 }, "Spray 500 ml"),
    listings: [
      { storeId: "store-b", baseCents: 349, scenario: "stable" },
      { storeId: "store-d", baseCents: 389, scenario: "stable" },
    ],
  },
  {
    product: product("Éponges grattantes — lot de 6", MDD_A, "private_label", "cat-eponges", { amount: 6, unit: "unit", packCount: 1 }, "Lot de 6"),
    listings: [
      { storeId: "store-a", baseCents: 189, scenario: "stable" },
      { storeId: "store-c", baseCents: 149, scenario: "stable" },
    ],
  },
  {
    product: product("Sacs-poubelle 30 L à liens — 3 rouleaux de 20", CEDRE, "national", "cat-sacs", { amount: 20, unit: "unit", packCount: 3 }, "3 rouleaux de 20 sacs"),
    listings: [
      { storeId: "store-a", baseCents: 459, scenario: "real_promo" },
      { storeId: "store-b", baseCents: 479, scenario: "stable" },
      { storeId: "store-c", baseCents: 429, scenario: "stable" },
    ],
  },
  {
    product: product("Sacs-poubelle 30 L — rouleau de 20", MDD_C, "private_label", "cat-sacs", { amount: 20, unit: "unit", packCount: 1 }, "Rouleau de 20 sacs"),
    listings: [{ storeId: "store-c", baseCents: 119, scenario: "stable" }],
  },
  {
    product: product("Détartrant machine à café", AZUR, "national", "cat-specialises", { amount: 250, unit: "ml", packCount: 1 }, "Flacon 250 ml"),
    listings: [{ storeId: "store-d", baseCents: 495, scenario: "estimate_only" }],
  },
];

const DAY_MS = 86_400_000;

/** Bruit déterministe dans [-1, 1] : le jeu est identique à chaque exécution. */
function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

function generate(seed: Seed, listing: Listing, now: Date): PriceObservation[] {
  const { product: p } = seed;
  const key = `${p.id}:${listing.storeId}`;
  const out: PriceObservation[] = [];
  const add = (
    daysAgo: number,
    priceCents: number,
    extra: Partial<Pick<PriceObservation, "promo" | "method" | "confirmations" | "quantity">> = {},
  ) => {
    out.push({
      id: `demo-o-${key}-${daysAgo}`,
      productId: p.id,
      storeId: listing.storeId,
      observedAt: new Date(now.getTime() - daysAgo * DAY_MS - 3_600_000).toISOString(),
      priceCents: Math.round(priceCents),
      quantity: p.quantity,
      sourceId: DEMO_SOURCE.id,
      method: "receipt",
      confirmations: 0,
      ...extra,
    });
  };
  const base = listing.baseCents;
  const methods: CollectionMethod[] = ["receipt", "shelf_label", "receipt"];
  const regular = (from: number, to: number, level = base) => {
    for (let d = from; d >= to; d -= 9) {
      // Variations ordinaires d'au plus ±1 %.
      add(d, level * (1 + noise(`${key}:${d}`) * 0.01), { method: methods[d % 3]! });
    }
  };

  switch (listing.scenario) {
    case "stable":
      regular(118, 2);
      break;
    case "real_promo":
      regular(118, 10);
      add(1, base * 0.8, { promo: { claimedReferencePriceCents: base, label: "-20 %" } });
      break;
    case "fake_reference":
      regular(118, 10);
      add(1, base * 0.99, {
        promo: { claimedReferencePriceCents: Math.round(base * 1.45), label: "Prix choc" },
        method: "shelf_label",
        confirmations: 2,
      });
      break;
    case "inflated_then_promo":
      regular(118, 28);
      for (const d of [19, 12, 6]) add(d, base * 1.22, { method: "shelf_label" });
      add(1, base, { promo: { claimedReferencePriceCents: Math.round(base * 1.22), label: "-18 %" } });
      break;
    case "shrinkflation":
      regular(118, 20, base);
      for (const d of [11, 2]) {
        add(d, base, { quantity: { ...p.quantity, amount: p.quantity.amount * 0.9 } });
      }
      break;
    case "stale":
      regular(118, 64);
      break;
    case "estimate_only":
      add(0, base, { method: "model_estimate" });
      break;
    case "community":
      regular(118, 30);
      add(4, base * 0.97, { method: "community_report" });
      break;
  }
  return out;
}

/** Catalogue de démonstration. `now` fixe l'ancrage temporel du jeu fictif. */
export function createDemoCatalog(now: Date = new Date()): CatalogRepository {
  const products = seeds.map((s) => s.product);
  const categoryName = new Map(demoCategories.map((c) => [c.id, c.name]));
  const observations = new Map<string, PriceObservation[]>(
    seeds.map((s) => [s.product.id, s.listings.flatMap((l) => generate(s, l, now))]),
  );

  return {
    dataset: { kind: "demo", label: "Données de démonstration fictives" },
    listCategories: async () => demoCategories,
    listStores: async () => demoStores,
    listSources: async () => [DEMO_SOURCE],
    searchProducts: async ({ text, categoryId }) =>
      products.filter(
        (p) =>
          (!categoryId || p.categoryId === categoryId) &&
          (!text?.trim() ||
            matchesQuery(`${p.name} ${p.brandName} ${categoryName.get(p.categoryId) ?? ""}`, text)),
      ),
    getProduct: async (id) => products.find((p) => p.id === id) ?? null,
    getProductByBarcode: async (barcode) => products.find((p) => p.barcode === barcode) ?? null,
    listObservations: async (productId) => observations.get(productId) ?? [],
  };
}

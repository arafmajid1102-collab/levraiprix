import { describe, expect, it } from "vitest";
import {
  assessOffer,
  buildProductView,
  classifyPriceStatus,
  computeConfidence,
  computeUnitPrice,
  formatPrice,
  formatRelativeDay,
  formatUnitPrice,
  isValidGtin,
  matchesQuery,
  resolveUnitPrice,
  type Category,
  type PriceObservation,
  type Product,
  type Quantity,
  type Store,
  sortStoresByProximity,
  storeProximity,
} from "./index";

const NOW = new Date("2026-11-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const laundry: Category = {
  id: "c1",
  slug: "lessives",
  name: "Lessives",
  comparisonBasis: "per_wash",
  fallbackBasis: "per_litre",
};
const bottle: Quantity = { amount: 1.5, unit: "l", packCount: 1, usesCount: 30 };

let seq = 0;
function obs(partial: Partial<PriceObservation> & { daysAgo: number; priceCents: number }): PriceObservation {
  const { daysAgo: d, ...rest } = partial;
  return {
    id: `o${++seq}`,
    productId: "p1",
    storeId: "s1",
    observedAt: daysAgo(d),
    quantity: bottle,
    sourceId: "src",
    method: "receipt",
    confirmations: 0,
    ...rest,
  };
}

describe("prix unitaire", () => {
  it("calcule le prix par lavage en tenant compte du lot", () => {
    const u = computeUnitPrice(1200, { amount: 1.5, unit: "l", packCount: 2, usesCount: 30 }, "per_wash");
    expect(u).toEqual({ basis: "per_wash", cents: 20 });
  });
  it("convertit ml → litre et g → kg", () => {
    expect(computeUnitPrice(150, { amount: 500, unit: "ml", packCount: 1 }, "per_litre")?.cents).toBe(300);
    expect(computeUnitPrice(400, { amount: 800, unit: "g", packCount: 1 }, "per_kg")?.cents).toBe(500);
  });
  it("calcule le prix par sac", () => {
    expect(computeUnitPrice(300, { amount: 20, unit: "unit", packCount: 3 }, "per_unit")?.cents).toBe(5);
  });
  it("ne fabrique pas de valeur quand la donnée manque", () => {
    expect(computeUnitPrice(500, { amount: 1, unit: "l", packCount: 1 }, "per_wash")).toBeNull();
    expect(computeUnitPrice(500, { amount: 1, unit: "l", packCount: 1 }, "per_kg")).toBeNull();
    expect(computeUnitPrice(500, { amount: 0, unit: "l", packCount: 1 }, "per_litre")).toBeNull();
  });
  it("se replie sur la base de secours", () => {
    expect(resolveUnitPrice(600, { amount: 2, unit: "l", packCount: 1 }, laundry)).toEqual({
      basis: "per_litre",
      cents: 300,
    });
  });
});

describe("statut et confiance", () => {
  it("distingue confirmé, constaté, historique et estimé", () => {
    expect(classifyPriceStatus(obs({ daysAgo: 2, priceCents: 1 }), NOW)).toBe("confirmed");
    expect(classifyPriceStatus(obs({ daysAgo: 2, priceCents: 1, method: "community_report" }), NOW)).toBe("observed");
    expect(
      classifyPriceStatus(obs({ daysAgo: 2, priceCents: 1, method: "community_report", confirmations: 2 }), NOW),
    ).toBe("confirmed");
    expect(classifyPriceStatus(obs({ daysAgo: 20, priceCents: 1 }), NOW)).toBe("observed");
    expect(classifyPriceStatus(obs({ daysAgo: 45, priceCents: 1 }), NOW)).toBe("historical");
    expect(classifyPriceStatus(obs({ daysAgo: 0, priceCents: 1, method: "model_estimate" }), NOW)).toBe("estimated");
  });
  it("la confiance décroît avec l'âge et croît avec les confirmations", () => {
    const fresh = computeConfidence(obs({ daysAgo: 0, priceCents: 1 }), NOW);
    const old = computeConfidence(obs({ daysAgo: 60, priceCents: 1 }), NOW);
    expect(fresh.level).toBe("high");
    expect(old.score).toBeLessThan(fresh.score);
    const lone = computeConfidence(obs({ daysAgo: 1, priceCents: 1, method: "community_report" }), NOW);
    const backed = computeConfidence(obs({ daysAgo: 1, priceCents: 1, method: "community_report", confirmations: 3 }), NOW);
    expect(backed.score).toBeGreaterThan(lone.score);
  });
});

describe("évaluation des offres", () => {
  const stable = [80, 65, 50, 35, 20, 10].map((d) => obs({ daysAgo: d, priceCents: 900 }));

  it("refuse de conclure sans historique suffisant", () => {
    const current = obs({ daysAgo: 0, priceCents: 600, promo: { claimedReferencePriceCents: 900 } });
    const a = assessOffer(current, [obs({ daysAgo: 5, priceCents: 900 })], laundry);
    expect(a.verdict).toBe("insufficient_data");
    expect(a.score).toBeNull();
  });

  it("reconnaît une vraie bonne affaire", () => {
    const current = obs({ daysAgo: 0, priceCents: 720, promo: { claimedReferencePriceCents: 900 } });
    const a = assessOffer(current, stable, laundry);
    expect(a.verdict).toBe("good_deal");
    expect(a.realChange).toBeCloseTo(-0.2);
    expect(a.findings.map((f) => f.code)).toEqual(["REAL_DISCOUNT"]);
  });

  it("détecte un faux prix barré", () => {
    const current = obs({ daysAgo: 0, priceCents: 890, promo: { claimedReferencePriceCents: 1290 } });
    const a = assessOffer(current, stable, laundry);
    expect(a.verdict).toBe("misleading");
    expect(a.findings.map((f) => f.code)).toContain("FAKE_REFERENCE_PRICE");
  });

  it("détecte un prix gonflé avant la promotion", () => {
    const history = [
      ...[85, 70, 55, 40].map((d) => obs({ daysAgo: d, priceCents: 900 })),
      ...[18, 10, 4].map((d) => obs({ daysAgo: d, priceCents: 1100 })),
    ];
    const current = obs({ daysAgo: 0, priceCents: 899, promo: { claimedReferencePriceCents: 1100 } });
    const a = assessOffer(current, history, laundry);
    expect(a.verdict).toBe("misleading");
    expect(a.findings.map((f) => f.code)).toContain("PRE_PROMO_INFLATION");
  });

  it("détecte la réduflation", () => {
    const smaller: Quantity = { amount: 1.25, unit: "l", packCount: 1, usesCount: 25 };
    const current = obs({ daysAgo: 0, priceCents: 900, quantity: smaller });
    const a = assessOffer(current, stable, laundry);
    expect(a.verdict).toBe("misleading");
    expect(a.findings.map((f) => f.code)).toContain("SHRINKFLATION");
  });

  it("ignore les estimations dans l'historique", () => {
    const estimates = [80, 60, 40, 20, 10].map((d) =>
      obs({ daysAgo: d, priceCents: 2000, method: "model_estimate" }),
    );
    const a = assessOffer(obs({ daysAgo: 0, priceCents: 900 }), estimates, laundry);
    expect(a.verdict).toBe("insufficient_data");
  });
});

describe("fiche produit", () => {
  const product: Product = {
    id: "p1",
    name: "Lessive test",
    brandName: "Marque",
    brandType: "national",
    categoryId: "c1",
    quantity: bottle,
  };
  const stores: Store[] = ["s1", "s2", "s3", "s4"].map((id) => ({
    id,
    retailerName: "Enseigne",
    name: `Magasin ${id}`,
    city: "Ville",
    postalCode: "00000",
  }));

  it("ne classe que les prix constatés récents, par prix unitaire", () => {
    const view = buildProductView(
      product,
      laundry,
      stores,
      [
        obs({ daysAgo: 3, priceCents: 950, storeId: "s1" }),
        obs({ daysAgo: 5, priceCents: 870, storeId: "s2" }),
        obs({ daysAgo: 70, priceCents: 500, storeId: "s3" }),
        obs({ daysAgo: 0, priceCents: 400, storeId: "s4", method: "model_estimate" }),
      ],
      NOW,
    );
    expect(view.ranked.map((o) => o.store.id)).toEqual(["s2", "s1"]);
    expect(view.best?.store.id).toBe("s2");
    expect(view.unranked.map((o) => o.status).sort()).toEqual(["estimated", "historical"]);
  });
});

describe("formats et utilitaires", () => {
  it("formate les montants à la française", () => {
    expect(formatPrice(349)).toBe("3,49 €");
    expect(formatPrice(123456)).toBe("1 234,56 €");
    expect(formatUnitPrice({ basis: "per_wash", cents: 18.3 })).toBe("0,18 € / lavage");
    expect(formatUnitPrice({ basis: "per_unit", cents: 4.7 })).toBe("0,047 € / unité");
  });
  it("formate les dates relatives", () => {
    expect(formatRelativeDay(daysAgo(0), NOW)).toBe("aujourd'hui");
    expect(formatRelativeDay(daysAgo(1), NOW)).toBe("hier");
    expect(formatRelativeDay(daysAgo(12), NOW)).toBe("il y a 12 jours");
    expect(formatRelativeDay(daysAgo(95), NOW)).toBe("il y a 3 mois");
  });
  it("valide les codes-barres", () => {
    expect(isValidGtin("3017620422003")).toBe(true);
    expect(isValidGtin("3017620422004")).toBe(false);
    expect(isValidGtin("abc")).toBe(false);
  });
  it("recherche sans tenir compte des accents ni de la casse", () => {
    expect(matchesQuery("Éponges grattantes — Lot de 6", "eponge lot")).toBe(true);
    expect(matchesQuery("Liquide vaisselle citron", "lessive")).toBe(false);
  });
});

describe("proximité des magasins", () => {
  const store = (name: string, postalCode: string, city: string) => ({ name, postalCode, city });
  it("distingue commune, département et ailleurs, y compris outre-mer", () => {
    expect(storeProximity(store("A", "69001", "Lyon"), "69001")).toBe("same_postal_code");
    expect(storeProximity(store("A", "69100", "Villeurbanne"), "69001")).toBe("same_department");
    expect(storeProximity(store("A", "75011", "Paris"), "69001")).toBe("elsewhere");
    expect(storeProximity(store("A", "97410", "Saint-Pierre"), "97400")).toBe("same_department");
    expect(storeProximity(store("A", "97110", "Pointe-à-Pitre"), "97400")).toBe("elsewhere");
    expect(storeProximity(store("A", "69001", "Lyon"), null)).toBe("elsewhere");
  });

  it("trie les plus proches d'abord", () => {
    const sorted = sortStoresByProximity(
      [store("Z", "75011", "Paris"), store("B", "69100", "Villeurbanne"), store("C", "69001", "Lyon"), store("A", "13001", "Marseille")],
      "69001",
    );
    expect(sorted.map((s) => s.name)).toEqual(["C", "B", "A", "Z"]);
  });
});

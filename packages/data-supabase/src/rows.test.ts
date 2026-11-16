import { describe, expect, it } from "vitest";
import { readSupabaseConfig, toObservation, toProduct, toStore, type ObservationRow, type ProductRow } from "./index";

const productRow: ProductRow = {
  id: "p",
  name: "Lessive",
  category_id: "c",
  barcode: null,
  quantity_amount: "1.500",
  quantity_unit: "l",
  pack_count: 2,
  uses_count: 30,
  packaging: null,
  image_path: null,
  brands: { name: "Marque", brand_type: "private_label" },
};

const observationRow: ObservationRow = {
  id: "o",
  product_id: "p",
  store_id: "s",
  observed_at: "2026-11-10T08:00:00+01:00",
  price_cents: 899,
  quantity_amount: 1.5,
  quantity_unit: "l",
  pack_count: 1,
  uses_count: null,
  is_promo: false,
  promo_reference_price_cents: null,
  promo_label: null,
  source_id: "src",
  method: "receipt",
  confirmations: 1,
};

describe("conversion des lignes Supabase", () => {
  it("convertit un produit (numeric renvoyé en texte, marque jointe)", () => {
    expect(toProduct(productRow)).toEqual({
      id: "p",
      name: "Lessive",
      brandName: "Marque",
      brandType: "private_label",
      categoryId: "c",
      quantity: { amount: 1.5, unit: "l", packCount: 2, usesCount: 30 },
    });
  });

  it("n'invente pas de marque quand elle manque", () => {
    expect(toProduct({ ...productRow, brands: null }).brandName).toBe("Marque non renseignée");
  });

  it("normalise la date en UTC et n'ajoute une promotion que si elle est déclarée", () => {
    const plain = toObservation(observationRow);
    expect(plain.observedAt).toBe("2026-11-10T07:00:00.000Z");
    expect(plain.promo).toBeUndefined();
    const promo = toObservation({ ...observationRow, is_promo: true, promo_reference_price_cents: 1099 });
    expect(promo.promo).toEqual({ claimedReferencePriceCents: 1099 });
  });

  it("convertit un magasin sans enseigne ni coordonnées", () => {
    expect(
      toStore({ id: "s", name: "Épicerie", postal_code: "75011", city: "Paris", latitude: null, longitude: null, retailers: null }),
    ).toEqual({ id: "s", retailerName: "Indépendant", name: "Épicerie", city: "Paris", postalCode: "75011" });
  });
});

describe("configuration", () => {
  it("renvoie null si elle est incomplète", () => {
    expect(readSupabaseConfig(undefined, "k")).toBeNull();
    expect(readSupabaseConfig("https://x.supabase.co", "")).toBeNull();
  });
  it("refuse une clé secrète côté client", () => {
    expect(() => readSupabaseConfig("https://x.supabase.co", "sb_secret_abc")).toThrow(/clé secrète/);
  });
});

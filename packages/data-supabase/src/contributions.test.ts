import { describe, expect, it } from "vitest";
import {
  parseDecimalInput,
  parsePriceInput,
  toSubmission,
  validateProof,
  validatePriceDraft,
  validateProductDraft,
  validateStoreDraft,
  type PriceDraft,
  type ProductDraft,
} from "./contributions";

describe("saisie d'un prix", () => {
  it("convertit les écritures courantes en centimes, sans erreur d'arrondi", () => {
    expect(parsePriceInput("3,49")).toBe(349);
    expect(parsePriceInput("3.49 €")).toBe(349);
    expect(parsePriceInput("3")).toBe(300);
    expect(parsePriceInput("3,5")).toBe(350);
    expect(parsePriceInput("0,07")).toBe(7);
    expect(parsePriceInput("19,99")).toBe(1999);
  });

  it("refuse ce qui n'est pas un montant net", () => {
    for (const bad of ["", "0", "0,00", "-3", "3,499", "trois", "3,49,1", "1e3"]) {
      expect(parsePriceInput(bad), bad).toBeNull();
    }
  });

  it("lit les contenances décimales", () => {
    expect(parseDecimalInput("1,5")).toBe(1.5);
    expect(parseDecimalInput("750")).toBe(750);
    expect(parseDecimalInput("0")).toBeNull();
    expect(parseDecimalInput("1,5 L")).toBeNull();
  });

  const now = new Date(2026, 10, 16, 15, 30);
  const draft = (extra: Partial<PriceDraft> = {}): PriceDraft => ({
    price: "3,49",
    observedOn: "2026-11-16",
    isPromo: false,
    referencePrice: "",
    promoLabel: "",
    ...extra,
  });

  it("accepte un relevé du jour, daté de l'instant présent", () => {
    expect(validatePriceDraft(draft(), now)).toEqual({
      ok: true,
      value: { priceCents: 349, observedAt: now.toISOString(), isPromo: false, referencePriceCents: null, promoLabel: null },
    });
  });

  it("refuse une date future, trop ancienne ou inexistante", () => {
    expect(validatePriceDraft(draft({ observedOn: "2026-11-17" }), now).ok).toBe(false);
    expect(validatePriceDraft(draft({ observedOn: "2026-07-01" }), now).ok).toBe(false);
    expect(validatePriceDraft(draft({ observedOn: "2026-02-30" }), now).ok).toBe(false);
    expect(validatePriceDraft(draft({ observedOn: "2026-10-01" }), now).ok).toBe(true);
  });

  it("exige un prix barré supérieur au prix payé, et l'ignore hors promotion", () => {
    expect(validatePriceDraft(draft({ isPromo: true, referencePrice: "3,00" }), now).ok).toBe(false);
    expect(validatePriceDraft(draft({ isPromo: true, referencePrice: "4,99", promoLabel: " -30 % " }), now)).toMatchObject({
      value: { isPromo: true, referencePriceCents: 499, promoLabel: "-30 %" },
    });
    expect(validatePriceDraft(draft({ isPromo: false, referencePrice: "4,99" }), now)).toMatchObject({
      value: { isPromo: false, referencePriceCents: null },
    });
  });
});

describe("proposition de produit et de magasin", () => {
  const product = (extra: Partial<ProductDraft> = {}): ProductDraft => ({
    name: "Lessive liquide 30 lavages",
    brand: " Exemple ",
    brandType: "national",
    categoryId: "cat-1",
    barcode: "",
    amount: "1,5",
    unit: "l",
    packCount: "",
    usesCount: "30",
    ...extra,
  });

  it("normalise un produit valide", () => {
    expect(validateProductDraft(product())).toEqual({
      ok: true,
      value: {
        name: "Lessive liquide 30 lavages",
        brand: "Exemple",
        brandType: "national",
        categoryId: "cat-1",
        barcode: null,
        amount: 1.5,
        unit: "l",
        packCount: 1,
        usesCount: 30,
      },
    });
  });

  it("vérifie la clé de contrôle du code-barres", () => {
    expect(validateProductDraft(product({ barcode: "3017620422003" })).ok).toBe(true);
    expect(validateProductDraft(product({ barcode: "3017620422004" })).ok).toBe(false);
  });

  it("refuse un produit sans nom, sans catégorie ou sans contenance", () => {
    expect(validateProductDraft(product({ name: " " })).ok).toBe(false);
    expect(validateProductDraft(product({ categoryId: "" })).ok).toBe(false);
    expect(validateProductDraft(product({ amount: "" })).ok).toBe(false);
    expect(validateProductDraft(product({ packCount: "0" })).ok).toBe(false);
  });

  it("valide un magasin et son code postal", () => {
    expect(validateStoreDraft({ retailer: "", name: "Centre", postalCode: "75011", city: "Paris" }).ok).toBe(true);
    expect(validateStoreDraft({ retailer: "", name: "Centre", postalCode: "7501", city: "Paris" }).ok).toBe(false);
    expect(validateStoreDraft({ retailer: "", name: "Centre", postalCode: "75011", city: " " }).ok).toBe(false);
  });
});

describe("suivi des envois", () => {
  it("signale un produit ou un magasin encore non publié", () => {
    const submission = toSubmission({
      id: "o1",
      observed_at: "2026-11-16T10:00:00+00:00",
      created_at: "2026-11-16T10:01:00+00:00",
      price_cents: 349,
      is_promo: false,
      promo_reference_price_cents: null,
      promo_label: null,
      review_status: "pending",
      method: "receipt",
      proof_path: "u1/ticket.jpg",
      quantity_amount: "1.500",
      quantity_unit: "l",
      pack_count: 1,
      uses_count: 30,
      products: { name: "Lessive", barcode: null, review_status: "pending", brands: { name: "Exemple" }, categories: { name: "Lessives" } },
      stores: { name: "Centre", city: "Paris", postal_code: "75011", review_status: "accepted", retailers: { name: "Enseigne" } },
    });
    expect(submission).toMatchObject({
      newProduct: true,
      newStore: false,
      method: "receipt",
      proofPath: "u1/ticket.jpg",
      storeLabel: "Enseigne — Centre, 75011 Paris",
      quantity: { amount: 1.5, unit: "l", packCount: 1, usesCount: 30 },
    });
  });
});

describe("preuve photo", () => {
  it("n'accepte que des images de taille raisonnable", () => {
    expect(validateProof(200_000, "image/jpeg")).toBeNull();
    expect(validateProof(200_000, "application/pdf")).not.toBeNull();
    expect(validateProof(0, "image/png")).not.toBeNull();
    expect(validateProof(6 * 1024 * 1024, "image/webp")).not.toBeNull();
  });
});

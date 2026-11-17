import { describe, expect, it } from "vitest";
import type { ProductDraft } from "./contributions";
import { applySuggestion, lookupOpenFacts, parseOpenFactsProduct, parseQuantityText } from "./openfacts";

const CODE = "3256227029431";
const found = (product: Record<string, unknown>) => ({ status: 1, product });

describe("contenance lue dans une base ouverte", () => {
  it("comprend les écritures courantes", () => {
    expect(parseQuantityText("1,5 litre")).toEqual({ amount: "1,5", unit: "l" });
    expect(parseQuantityText("1,53 l")).toEqual({ amount: "1,53", unit: "l" });
    expect(parseQuantityText("0.528 kg")).toEqual({ amount: "0,528", unit: "kg" });
    expect(parseQuantityText("400 g e")).toEqual({ amount: "400", unit: "g" });
    expect(parseQuantityText("750ml")).toEqual({ amount: "750", unit: "ml" });
    expect(parseQuantityText("75 cl")).toEqual({ amount: "750", unit: "ml" });
  });

  it("refuse ce qui fausserait le prix au litre plutôt que de deviner", () => {
    expect(parseQuantityText("2 ,15 L")).toBeNull();
    expect(parseQuantityText("3 x 1,5 L")).toBeNull();
    expect(parseQuantityText("20 lavages")).toBeNull();
    expect(parseQuantityText("0 l")).toBeNull();
    expect(parseQuantityText("")).toBeNull();
  });
});

describe("proposition de fiche produit", () => {
  it("retient le nom français, la première marque et la contenance", () => {
    const s = parseOpenFactsProduct(
      found({ product_name: "Marseille soap", product_name_fr: " Lessive liquide  savon de Marseille ", brands: "U, Système U", quantity: "1,5 litre" }),
      "open-products-facts",
      CODE,
    );
    expect(s).toEqual({
      source: "open-products-facts",
      sourceLabel: "Open Products Facts",
      url: `https://world.openproductsfacts.org/product/${CODE}`,
      barcode: CODE,
      name: "Lessive liquide savon de Marseille",
      brand: "U",
      amount: "1,5",
      unit: "l",
    });
  });

  it("n'utilise la contenance calculée que si le texte d'origine est absent", () => {
    const calc = { product_quantity: 15000, product_quantity_unit: "ml" };
    // Cas réel : « 2 ,15 L » mal saisi, converti à tort en 15 000 mL par la base.
    expect(parseOpenFactsProduct(found({ product_name: "MIR", quantity: "2 ,15 L", ...calc }), "open-products-facts", CODE)).toMatchObject({ amount: "", unit: null });
    expect(parseOpenFactsProduct(found({ product_name: "MIR", quantity: "", ...calc }), "open-products-facts", CODE)).toMatchObject({ amount: "15000", unit: "ml" });
  });

  it("renvoie null pour un produit inconnu, vide ou une réponse inattendue", () => {
    expect(parseOpenFactsProduct({ status: 0, status_verbose: "product not found" }, "open-food-facts", CODE)).toBeNull();
    expect(parseOpenFactsProduct(found({ product_name: "", brands: "", quantity: "1 l" }), "open-food-facts", CODE)).toBeNull();
    expect(parseOpenFactsProduct("<html>", "open-food-facts", CODE)).toBeNull();
    expect(parseOpenFactsProduct(null, "open-food-facts", CODE)).toBeNull();
  });
});

describe("recherche par code-barres", () => {
  const reply = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

  it("interroge d'abord les produits non alimentaires, puis l'alimentaire", async () => {
    const calls: string[] = [];
    const fetchStub = (async (url: string) => {
      calls.push(url);
      return url.includes("openproductsfacts") ? reply({ status: 0 }) : reply(found({ product_name: "Nutella", brands: "Ferrero", quantity: "400 g" }));
    }) as unknown as typeof fetch;
    const s = await lookupOpenFacts(CODE, { fetch: fetchStub });
    expect(s).toMatchObject({ source: "open-food-facts", name: "Nutella", amount: "400", unit: "g" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain(`world.openproductsfacts.org/api/v2/product/${CODE}.json`);
  });

  it("s'arrête au premier résultat : un seul appel", async () => {
    let count = 0;
    const fetchStub = (async () => (count++, reply(found({ product_name: "Lessive" })))) as unknown as typeof fetch;
    expect(await lookupOpenFacts(CODE, { fetch: fetchStub })).toMatchObject({ source: "open-products-facts" });
    expect(count).toBe(1);
  });

  it("n'appelle personne pour un code-barres invalide", async () => {
    let count = 0;
    const fetchStub = (async () => (count++, reply({}))) as unknown as typeof fetch;
    expect(await lookupOpenFacts("1234", { fetch: fetchStub })).toBeNull();
    expect(await lookupOpenFacts("3256227029432", { fetch: fetchStub })).toBeNull();
    // Code interne à un magasin (préfixe 2) : valide, mais sans signification hors de ce magasin.
    expect(await lookupOpenFacts("2000000000015", { fetch: fetchStub })).toBeNull();
    expect(count).toBe(0);
  });

  it("ne lève jamais : panne réseau ou erreur serveur donnent null", async () => {
    const down = (async () => { throw new Error("réseau"); }) as unknown as typeof fetch;
    expect(await lookupOpenFacts(CODE, { fetch: down })).toBeNull();
    const error = (async () => reply({}, false)) as unknown as typeof fetch;
    expect(await lookupOpenFacts(CODE, { fetch: error })).toBeNull();
  });
});

describe("préremplissage du formulaire", () => {
  const empty: ProductDraft = { name: "", brand: "", brandType: "national", categoryId: "", barcode: CODE, amount: "", unit: "l", packCount: "1", usesCount: "" };
  const suggestion = parseOpenFactsProduct(found({ product_name: "Lessive", brands: "U", quantity: "750 ml" }), "open-products-facts", CODE)!;

  it("remplit les champs vides, contenance et unité ensemble", () => {
    expect(applySuggestion(empty, suggestion)).toEqual({ ...empty, name: "Lessive", brand: "U", amount: "750", unit: "ml" });
  });

  it("n'écrase jamais une saisie de l'utilisateur", () => {
    const typed = { ...empty, name: "Ma lessive", amount: "1,5", unit: "l" as const };
    expect(applySuggestion(typed, suggestion)).toEqual({ ...typed, brand: "U" });
  });

  it("laisse la contenance vide quand la base n'en donne pas de fiable", () => {
    expect(applySuggestion(empty, { ...suggestion, amount: "", unit: null })).toMatchObject({ amount: "", unit: "l" });
  });
});

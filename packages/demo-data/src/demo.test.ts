import { buildProductView, isValidGtin } from "@lvp/core";
import { describe, expect, it } from "vitest";
import { createDemoCatalog, DEMO_SOURCE } from "./index";

const NOW = new Date("2026-11-15T12:00:00Z");
const catalog = createDemoCatalog(NOW);

async function view(id: string) {
  const product = (await catalog.getProduct(id))!;
  const category = (await catalog.listCategories()).find((c) => c.id === product.categoryId)!;
  return buildProductView(product, category, await catalog.listStores(), await catalog.listObservations(id), NOW);
}

describe("jeu de démonstration", () => {
  it("s'annonce comme fictif et n'utilise qu'une source de démonstration", async () => {
    expect(catalog.dataset.kind).toBe("demo");
    expect(DEMO_SOURCE.isDemo).toBe(true);
    for (const p of await catalog.searchProducts({})) {
      for (const o of await catalog.listObservations(p.id)) expect(o.sourceId).toBe(DEMO_SOURCE.id);
      expect(isValidGtin(p.barcode!)).toBe(true);
      expect(p.barcode!.startsWith("20")).toBe(true);
    }
  });

  it("est déterministe", async () => {
    const again = createDemoCatalog(NOW);
    expect(await again.listObservations("demo-p1")).toEqual(await catalog.listObservations("demo-p1"));
  });

  it("recherche par texte, catégorie et code-barres", async () => {
    expect((await catalog.searchProducts({ text: "lessive" })).length).toBe(4);
    expect((await catalog.searchProducts({ categoryId: "cat-sacs" })).length).toBe(2);
    const p = await catalog.getProduct("demo-p5");
    expect((await catalog.getProductByBarcode(p!.barcode!))?.id).toBe("demo-p5");
  });

  it("couvre les scénarios attendus sur la lessive de référence", async () => {
    const v = await view("demo-p1");
    const verdictOf = (storeId: string) =>
      [...v.ranked, ...v.unranked].find((o) => o.store.id === storeId)!;
    expect(verdictOf("store-a").assessment.verdict).toBe("misleading");
    expect(verdictOf("store-b").assessment.verdict).toBe("good_deal");
    expect(verdictOf("store-d").status).toBe("historical");
    expect(v.best?.store.id).toBe("store-b");
    expect(v.unranked.map((o) => o.store.id)).toEqual(["store-d"]);
  });

  it("signale le prix gonflé, la réduflation et l'estimation", async () => {
    const caps = await view("demo-p4");
    expect(caps.ranked.find((o) => o.store.id === "store-a")!.assessment.findings.map((f) => f.code)).toContain(
      "PRE_PROMO_INFLATION",
    );
    const dish = await view("demo-p5");
    expect(dish.ranked.find((o) => o.store.id === "store-a")!.assessment.findings.map((f) => f.code)).toContain(
      "SHRINKFLATION",
    );
    const est = await view("demo-p14");
    expect(est.ranked).toHaveLength(0);
    expect(est.unranked[0]!.status).toBe("estimated");
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createPersonalStore, validateHome } from "./personal";

/** Faux client minimal : mémorise les favoris et peut simuler une panne. */
function fakeClient(options: { failWrites?: boolean } = {}) {
  const rows = { favorites: new Set<string>(["p1"]), user_stores: new Set<string>() };
  const result = (data: unknown) => Promise.resolve({ data, error: null });
  const failure = () => Promise.resolve({ data: null, error: { message: "panne" } });
  const client = {
    from(table: "favorites" | "user_stores" | "profiles") {
      return {
        select: () => ({
          eq: () =>
            table === "profiles"
              ? { maybeSingle: () => result({ postal_code: "69001", city: "Lyon" }) }
              : result([...rows[table]].map((id) => (table === "favorites" ? { product_id: id } : { store_id: id }))),
        }),
        upsert: (row: Record<string, string>) => {
          if (options.failWrites) return failure();
          rows[table as "favorites"].add(row.product_id ?? row.store_id!);
          return result(null);
        },
        delete: () => ({
          eq: () => ({
            eq: (_column: string, id: string) => {
              if (options.failWrites) return failure();
              rows[table as "favorites"].delete(id);
              return result(null);
            },
          }),
        }),
        update: () => ({ eq: () => (options.failWrites ? failure() : result(null)) }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, rows };
}

describe("données personnelles", () => {
  it("charge favoris, magasins et commune", async () => {
    const store = createPersonalStore(fakeClient().client, "u1");
    expect(store.getState().status).toBe("loading");
    await store.reload();
    expect(store.getState()).toMatchObject({ status: "ready", home: { postalCode: "69001", city: "Lyon" } });
    expect([...store.getState().favorites]).toEqual(["p1"]);
  });

  it("ajoute puis retire un favori, en prévenant les écrans abonnés", async () => {
    const { client, rows } = fakeClient();
    const store = createPersonalStore(client, "u1");
    await store.reload();
    let notified = 0;
    store.subscribe(() => notified++);
    expect(await store.toggleFavorite("p2")).toEqual({ ok: true, value: true });
    expect(rows.favorites.has("p2")).toBe(true);
    expect(await store.toggleFavorite("p2")).toEqual({ ok: true, value: false });
    expect(store.getState().favorites.has("p2")).toBe(false);
    expect(notified).toBe(2);
  });

  it("annule le changement affiché si l'enregistrement échoue", async () => {
    const store = createPersonalStore(fakeClient({ failWrites: true }).client, "u1");
    await store.reload();
    expect(await store.toggleFavorite("p2")).toMatchObject({ ok: false });
    expect(store.getState().favorites.has("p2")).toBe(false);
    expect(await store.toggleFavorite("p1")).toMatchObject({ ok: false });
    expect(store.getState().favorites.has("p1")).toBe(true);
    expect(await store.saveHome({ postalCode: "75011", city: "Paris" })).toMatchObject({ ok: false });
    expect(store.getState().home.postalCode).toBe("69001");
  });

  it("valide la commune, et accepte de l'effacer", () => {
    expect(validateHome({ postalCode: " 75011 ", city: " Paris " })).toEqual({ ok: true, value: { postalCode: "75011", city: "Paris" } });
    expect(validateHome({ postalCode: "", city: "" })).toEqual({ ok: true, value: { postalCode: null, city: null } });
    expect(validateHome({ postalCode: "7501", city: "Paris" }).ok).toBe(false);
    expect(validateHome({ postalCode: "75011", city: "" }).ok).toBe(false);
  });
});

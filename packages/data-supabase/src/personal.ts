/**
 * Données personnelles du compte connecté : favoris, magasins habituels et
 * commune. Un seul « magasin d'état » sert le site et l'application, via
 * `subscribe` / `getState` (compatible useSyncExternalStore).
 *
 * Les changements sont appliqués tout de suite à l'écran puis envoyés ; en cas
 * d'échec ils sont annulés et l'erreur est renvoyée à l'appelant.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Result } from "./contributions";

export interface HomeArea {
  postalCode: string | null;
  city: string | null;
}

export interface PersonalState {
  status: "loading" | "ready" | "error";
  favorites: ReadonlySet<string>;
  stores: ReadonlySet<string>;
  home: HomeArea;
}

export interface PersonalStore {
  getState(): PersonalState;
  subscribe(listener: () => void): () => void;
  reload(): Promise<void>;
  toggleFavorite(productId: string): Promise<Result<boolean>>;
  toggleStore(storeId: string): Promise<Result<boolean>>;
  saveHome(home: { postalCode: string; city: string }): Promise<Result<HomeArea>>;
}

export const emptyPersonalState: PersonalState = {
  status: "loading",
  favorites: new Set(),
  stores: new Set(),
  home: { postalCode: null, city: null },
};

/** Vide = effacer la commune. Sinon : cinq chiffres et un nom de ville. */
export function validateHome(home: { postalCode: string; city: string }): Result<HomeArea> {
  const postalCode = home.postalCode.trim();
  const city = home.city.trim();
  if (!postalCode && !city) return { ok: true, value: { postalCode: null, city: null } };
  if (!/^\d{5}$/.test(postalCode)) return { ok: false, message: "Le code postal comporte cinq chiffres." };
  if (city.length < 1 || city.length > 80) return { ok: false, message: "Indiquez votre ville." };
  return { ok: true, value: { postalCode, city } };
}

const SAVE_ERROR = "L'enregistrement n'a pas abouti. Vérifiez votre connexion et réessayez.";

export function createPersonalStore(client: SupabaseClient, userId: string): PersonalStore {
  let state = emptyPersonalState;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PersonalState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  async function reload() {
    const [favorites, stores, profile] = await Promise.all([
      client.from("favorites").select("product_id").eq("user_id", userId),
      client.from("user_stores").select("store_id").eq("user_id", userId),
      client.from("profiles").select("postal_code,city").eq("id", userId).maybeSingle(),
    ]);
    if (favorites.error || stores.error || profile.error) return set({ status: "error" });
    set({
      status: "ready",
      favorites: new Set(favorites.data.map((row) => row.product_id as string)),
      stores: new Set(stores.data.map((row) => row.store_id as string)),
      home: { postalCode: profile.data?.postal_code ?? null, city: profile.data?.city ?? null },
    });
  }

  /** Bascule l'appartenance à une liste (favoris ou magasins) ; renvoie le nouvel état. */
  async function toggle(key: "favorites" | "stores", table: string, column: string, id: string): Promise<Result<boolean>> {
    const before = state[key];
    const on = !before.has(id);
    const next = new Set(before);
    if (on) next.add(id);
    else next.delete(id);
    set({ [key]: next });
    const { error } = on
      ? await client.from(table).upsert({ user_id: userId, [column]: id }, { ignoreDuplicates: true })
      : await client.from(table).delete().eq("user_id", userId).eq(column, id);
    if (error) {
      // Annule uniquement ce changement, sans écraser ceux faits entre-temps.
      const reverted = new Set(state[key]);
      if (on) reverted.delete(id);
      else reverted.add(id);
      set({ [key]: reverted });
      return { ok: false, message: SAVE_ERROR };
    }
    return { ok: true, value: on };
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    reload,
    toggleFavorite: (productId) => toggle("favorites", "favorites", "product_id", productId),
    toggleStore: (storeId) => toggle("stores", "user_stores", "store_id", storeId),
    async saveHome(home) {
      const checked = validateHome(home);
      if (!checked.ok) return checked;
      const { error } = await client
        .from("profiles")
        .update({ postal_code: checked.value.postalCode, city: checked.value.city })
        .eq("id", userId);
      if (error) return { ok: false, message: SAVE_ERROR };
      set({ home: checked.value });
      return checked;
    },
  };
}

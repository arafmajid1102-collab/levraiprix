import type { Store } from "./types";

/**
 * Proximité d'un magasin par rapport au code postal de l'utilisateur.
 * Volontairement grossière : sans coordonnées fiables pour tous les magasins,
 * on ne prétend pas calculer une distance.
 */
export type Proximity = "same_postal_code" | "same_department" | "elsewhere";

export const proximityLabel: Record<Proximity, string> = {
  same_postal_code: "Dans votre commune",
  same_department: "Dans votre département",
  elsewhere: "Ailleurs",
};

/** « 75011 » → « 75 » ; outre-mer « 97400 » → « 974 ». */
export function departmentOf(postalCode: string): string {
  return /^9[78]/.test(postalCode) ? postalCode.slice(0, 3) : postalCode.slice(0, 2);
}

export function storeProximity(store: Pick<Store, "postalCode">, homePostalCode: string | null): Proximity {
  if (!homePostalCode) return "elsewhere";
  if (store.postalCode === homePostalCode) return "same_postal_code";
  return departmentOf(store.postalCode) === departmentOf(homePostalCode) ? "same_department" : "elsewhere";
}

const rank: Record<Proximity, number> = { same_postal_code: 0, same_department: 1, elsewhere: 2 };

/** Les plus proches d'abord, puis par ville et par nom. */
export function sortStoresByProximity<T extends Pick<Store, "postalCode" | "city" | "name">>(
  stores: readonly T[],
  homePostalCode: string | null,
): T[] {
  return [...stores].sort(
    (a, b) =>
      rank[storeProximity(a, homePostalCode)] - rank[storeProximity(b, homePostalCode)] ||
      a.city.localeCompare(b.city, "fr") ||
      a.name.localeCompare(b.name, "fr"),
  );
}

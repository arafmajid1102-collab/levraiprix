import type { Category, ComparisonBasis, Quantity, UnitPrice } from "./types";

/** Quantité totale exprimée dans l'unité de la base de comparaison, ou null si incalculable. */
export function totalForBasis(quantity: Quantity, basis: ComparisonBasis): number | null {
  const { amount, unit, packCount, usesCount } = quantity;
  if (!(amount > 0) || !(packCount > 0)) return null;
  switch (basis) {
    case "per_litre":
      if (unit === "l") return amount * packCount;
      if (unit === "ml") return (amount * packCount) / 1000;
      return null;
    case "per_kg":
      if (unit === "kg") return amount * packCount;
      if (unit === "g") return (amount * packCount) / 1000;
      return null;
    case "per_unit":
      return unit === "unit" ? amount * packCount : null;
    case "per_wash":
      return usesCount && usesCount > 0 ? usesCount * packCount : null;
  }
}

/** Prix unitaire sur une base donnée. Renvoie null plutôt que d'inventer une valeur. */
export function computeUnitPrice(
  priceCents: number,
  quantity: Quantity,
  basis: ComparisonBasis,
): UnitPrice | null {
  if (!Number.isFinite(priceCents) || priceCents < 0) return null;
  const total = totalForBasis(quantity, basis);
  if (total === null || total <= 0) return null;
  return { basis, cents: priceCents / total };
}

/**
 * Prix unitaire selon la base de la catégorie, avec repli sur la base de secours
 * lorsque la donnée manque (ex. lessive sans nombre de lavages → prix au litre).
 */
export function resolveUnitPrice(
  priceCents: number,
  quantity: Quantity,
  category: Pick<Category, "comparisonBasis" | "fallbackBasis">,
): UnitPrice | null {
  return (
    computeUnitPrice(priceCents, quantity, category.comparisonBasis) ??
    (category.fallbackBasis ? computeUnitPrice(priceCents, quantity, category.fallbackBasis) : null)
  );
}

export const basisLabel: Record<ComparisonBasis, string> = {
  per_wash: "lavage",
  per_litre: "litre",
  per_kg: "kg",
  per_unit: "unité",
};

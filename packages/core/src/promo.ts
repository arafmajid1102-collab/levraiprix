import { ageInDays } from "./reliability";
import type { Category, PriceObservation, UnitPrice } from "./types";
import { resolveUnitPrice, totalForBasis } from "./units";

/**
 * Évaluation déterministe d'une offre par rapport à l'historique RÉELLEMENT
 * constaté du même produit dans le même magasin. Aucune IA ici : des règles
 * explicables, et « données insuffisantes » plutôt qu'une économie inventée.
 */

export const promoConfig = {
  /** Historique minimal pour oser un verdict. */
  minObservations: 4,
  minSpanDays: 21,
  /** Fenêtre du prix de référence légal (plus bas prix des 30 jours précédents). */
  referenceWindowDays: 30,
  /** Fenêtre du prix habituel. */
  usualWindowDays: 90,
  /** Fenêtre où l'on cherche un gonflement juste avant la promotion. */
  inflationWindowDays: 21,
  /** Sous ce seuil, la baisse réelle est sans intérêt. */
  negligibleDiscount: 0.03,
  /** À partir de ce seuil, c'est une vraie bonne affaire. */
  goodDiscount: 0.1,
  /** Tolérance d'arrondi sur les comparaisons de prix. */
  tolerance: 0.01,
  /** Hausse qui signale un prix gonflé avant promotion. */
  inflationThreshold: 0.05,
} as const;

export type OfferVerdict = "good_deal" | "fair" | "negligible" | "misleading" | "insufficient_data";

export type FindingCode =
  | "REAL_DISCOUNT"
  | "NEGLIGIBLE_DISCOUNT"
  | "ABOVE_USUAL_PRICE"
  | "FAKE_REFERENCE_PRICE"
  | "PRE_PROMO_INFLATION"
  | "SHRINKFLATION"
  | "UNIT_PRICE_UP";

export interface Finding {
  code: FindingCode;
  tone: "good" | "warn" | "danger" | "neutral";
  message: string;
}

export interface OfferAssessment {
  verdict: OfferVerdict;
  /** Qualité de l'offre de 0 à 100 ; null si l'historique est insuffisant. */
  score: number | null;
  /** Écart réel au prix unitaire habituel (négatif = moins cher). */
  realChange: number | null;
  findings: Finding[];
  evidence: {
    sampleSize: number;
    spanDays: number;
    usualUnitPrice: UnitPrice | null;
    lowestRecentPriceCents: number | null;
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const pct = (ratio: number) => `${Math.round(Math.abs(ratio) * 100)} %`;
const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

/**
 * @param current  l'offre à évaluer
 * @param history  observations du même produit dans le même magasin (l'offre courante
 *                 et les estimations sont ignorées automatiquement)
 */
export function assessOffer(
  current: PriceObservation,
  history: PriceObservation[],
  category: Pick<Category, "comparisonBasis" | "fallbackBasis">,
): OfferAssessment {
  const at = new Date(current.observedAt);
  const prior = history
    .filter(
      (o) =>
        o.id !== current.id &&
        o.method !== "model_estimate" &&
        new Date(o.observedAt).getTime() < at.getTime(),
    )
    .map((o) => ({
      o,
      age: ageInDays(o.observedAt, at),
      unit: resolveUnitPrice(o.priceCents, o.quantity, category),
    }));

  const currentUnit = resolveUnitPrice(current.priceCents, current.quantity, category);
  const usualPool = prior.filter(
    (p) => p.age <= promoConfig.usualWindowDays && p.unit && p.unit.basis === currentUnit?.basis,
  );
  const spanDays = usualPool.length ? Math.round(Math.max(...usualPool.map((p) => p.age))) : 0;
  const recent = prior.filter((p) => p.age <= promoConfig.referenceWindowDays);
  const lowestRecentPriceCents = recent.length ? Math.min(...recent.map((p) => p.o.priceCents)) : null;

  const evidence = {
    sampleSize: usualPool.length,
    spanDays,
    usualUnitPrice: null as UnitPrice | null,
    lowestRecentPriceCents,
  };

  if (
    !currentUnit ||
    usualPool.length < promoConfig.minObservations ||
    spanDays < promoConfig.minSpanDays
  ) {
    return { verdict: "insufficient_data", score: null, realChange: null, findings: [], evidence };
  }

  const usualCents = median(usualPool.map((p) => p.unit!.cents));
  evidence.usualUnitPrice = { basis: currentUnit.basis, cents: usualCents };
  const realChange = currentUnit.cents / usualCents - 1;
  const findings: Finding[] = [];
  let misleading = false;

  // 1. Prix barré supérieur au plus bas prix des 30 jours précédents.
  const claimed = current.promo?.claimedReferencePriceCents;
  if (
    claimed !== undefined &&
    lowestRecentPriceCents !== null &&
    claimed > lowestRecentPriceCents * (1 + promoConfig.tolerance)
  ) {
    const announced = 1 - current.priceCents / claimed;
    const actual = 1 - current.priceCents / lowestRecentPriceCents;
    findings.push({
      code: "FAKE_REFERENCE_PRICE",
      tone: "danger",
      message:
        `Le prix barré (${euros(claimed)}) dépasse le plus bas prix constaté sur les 30 jours précédents ` +
        `(${euros(lowestRecentPriceCents)}). Réduction annoncée : ${pct(announced)} ; ` +
        `réduction réelle : ${actual >= 0.005 ? pct(actual) : "aucune"}.`,
    });
    if (actual < promoConfig.negligibleDiscount) misleading = true;
  }

  // 2. Prix gonflé juste avant la promotion.
  if (current.promo) {
    const justBefore = usualPool.filter((p) => p.age <= promoConfig.inflationWindowDays);
    const earlier = usualPool.filter((p) => p.age > promoConfig.inflationWindowDays);
    if (justBefore.length >= 2 && earlier.length >= 2) {
      const before = median(justBefore.map((p) => p.unit!.cents));
      const base = median(earlier.map((p) => p.unit!.cents));
      if (
        before > base * (1 + promoConfig.inflationThreshold) &&
        currentUnit.cents > base * (1 - promoConfig.negligibleDiscount)
      ) {
        findings.push({
          code: "PRE_PROMO_INFLATION",
          tone: "danger",
          message:
            `Le prix a augmenté de ${pct(before / base - 1)} dans les semaines précédant la promotion, ` +
            `qui ne fait que revenir au niveau antérieur.`,
        });
        misleading = true;
      }
    }
  }

  // 3. Quantité réduite / prix unitaire en hausse malgré un prix affiché stable ou en baisse.
  // On compare à la dernière observation faite AVANT le changement de quantité, pour que
  // la réduflation reste signalée tant que l'ancien format est dans la fenêtre habituelle.
  const now = totalForBasis(current.quantity, currentUnit.basis);
  const newestFirst = [...usualPool].sort((a, b) => a.age - b.age);
  const beforeShrink = newestFirst.find((p) => {
    const q = totalForBasis(p.o.quantity, currentUnit.basis);
    return q !== null && now !== null && q > now;
  });
  const last = newestFirst[0];
  if (beforeShrink && now !== null) {
    const before = totalForBasis(beforeShrink.o.quantity, currentUnit.basis)!;
    const unitUp = currentUnit.cents > beforeShrink.unit!.cents * (1 + promoConfig.tolerance);
    if (unitUp && current.priceCents <= beforeShrink.o.priceCents * (1 + promoConfig.tolerance)) {
      findings.push({
        code: "SHRINKFLATION",
        tone: "danger",
        message:
          `La quantité a diminué de ${pct(1 - now / before)} alors que le prix affiché n'a pas augmenté : ` +
          `le prix unitaire grimpe en réalité de ${pct(currentUnit.cents / beforeShrink.unit!.cents - 1)}.`,
      });
      misleading = true;
    }
  } else if (
    last &&
    current.priceCents < last.o.priceCents &&
    currentUnit.cents > last.unit!.cents * (1 + promoConfig.tolerance)
  ) {
    findings.push({
      code: "UNIT_PRICE_UP",
      tone: "danger",
      message: `Le prix affiché baisse, mais le prix unitaire augmente de ${pct(
        currentUnit.cents / last.unit!.cents - 1,
      )}.`,
    });
    misleading = true;
  }

  // 4. Écart réel au prix habituel.
  if (realChange <= -promoConfig.negligibleDiscount) {
    findings.push({
      code: "REAL_DISCOUNT",
      tone: "good",
      message: `Prix unitaire inférieur de ${pct(realChange)} au prix habituel constaté dans ce magasin.`,
    });
  } else if (realChange >= promoConfig.negligibleDiscount) {
    findings.push({
      code: "ABOVE_USUAL_PRICE",
      tone: "warn",
      message: `Prix unitaire supérieur de ${pct(realChange)} au prix habituel constaté dans ce magasin.`,
    });
    if (current.promo) misleading = true;
  } else if (current.promo) {
    findings.push({
      code: "NEGLIGIBLE_DISCOUNT",
      tone: "warn",
      message: "Présenté comme une promotion, mais le prix unitaire est quasiment le prix habituel.",
    });
  }

  let verdict: OfferVerdict;
  if (misleading) verdict = "misleading";
  else if (realChange <= -promoConfig.goodDiscount) verdict = "good_deal";
  else if (realChange <= -promoConfig.negligibleDiscount) verdict = "fair";
  else verdict = "negligible";

  const penalties = findings.filter((f) => f.tone === "danger").length * 25;
  const score = Math.round(Math.min(100, Math.max(0, 50 - realChange * 250 - penalties)));

  return { verdict, score, realChange, findings, evidence };
}

export const verdictLabel: Record<OfferVerdict, string> = {
  good_deal: "Vraie bonne affaire",
  fair: "Offre correcte",
  negligible: "Sans intérêt particulier",
  misleading: "Offre trompeuse",
  insufficient_data: "Historique insuffisant",
};

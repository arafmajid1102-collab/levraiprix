import type {
  CollectionMethod,
  Confidence,
  ConfidenceLevel,
  PriceObservation,
  PriceStatus,
} from "./types";

const DAY_MS = 86_400_000;

/** Seuils de fraîcheur, regroupés ici pour être ajustables sans toucher au reste. */
export const reliabilityConfig = {
  /** Au-delà, un prix constaté n'est plus « confirmé ». */
  confirmedWindowDays: 7,
  /** Au-delà, un prix constaté devient « historique ». */
  observedWindowDays: 30,
  /** Confirmations nécessaires pour qu'une méthode non probante soit « confirmée ». */
  confirmationsRequired: 2,
  /** Demi-vie de la confiance accordée à l'actualité d'un prix. */
  freshnessHalfLifeDays: 30,
} as const;

/** Fiabilité intrinsèque de chaque méthode de collecte (0 à 1). */
export const methodBaseConfidence: Record<CollectionMethod, number> = {
  receipt: 0.9,
  retailer_feed: 0.9,
  shelf_label: 0.8,
  community_report: 0.55,
  manual_entry: 0.5,
  model_estimate: 0.3,
};

/** Méthodes qui apportent une preuve à elles seules. */
const selfProvingMethods: ReadonlySet<CollectionMethod> = new Set(["receipt", "retailer_feed"]);

export function ageInDays(observedAt: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(observedAt).getTime()) / DAY_MS);
}

type StatusInput = Pick<PriceObservation, "observedAt" | "method" | "confirmations">;

export function classifyPriceStatus(observation: StatusInput, now: Date): PriceStatus {
  if (observation.method === "model_estimate") return "estimated";
  const age = ageInDays(observation.observedAt, now);
  if (age > reliabilityConfig.observedWindowDays) return "historical";
  const proven =
    selfProvingMethods.has(observation.method) ||
    observation.confirmations >= reliabilityConfig.confirmationsRequired;
  return age <= reliabilityConfig.confirmedWindowDays && proven ? "confirmed" : "observed";
}

function levelFor(score: number): ConfidenceLevel {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

/** Confiance dans le fait que ce prix est exact ET encore d'actualité. */
export function computeConfidence(observation: StatusInput, now: Date): Confidence {
  const base = methodBaseConfidence[observation.method];
  const bonus = Math.min(observation.confirmations, 3) * 0.08;
  const exactness = Math.min(0.98, base + bonus);
  const freshness =
    0.5 ** (ageInDays(observation.observedAt, now) / reliabilityConfig.freshnessHalfLifeDays);
  const score = Math.round(exactness * freshness * 100) / 100;
  return { score, level: levelFor(score) };
}

export const statusLabel: Record<PriceStatus, string> = {
  confirmed: "Prix confirmé",
  observed: "Prix constaté",
  historical: "Ancien prix",
  estimated: "Estimation",
};

export const methodLabel: Record<CollectionMethod, string> = {
  receipt: "Ticket de caisse",
  shelf_label: "Étiquette en rayon",
  retailer_feed: "Flux du distributeur",
  community_report: "Signalement communautaire",
  manual_entry: "Saisie manuelle",
  model_estimate: "Estimation calculée",
};

export const confidenceLabel: Record<ConfidenceLevel, string> = {
  high: "Confiance élevée",
  medium: "Confiance moyenne",
  low: "Confiance faible",
};

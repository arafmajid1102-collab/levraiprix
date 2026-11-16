import {
  confidenceLabel,
  formatRelativeDay,
  statusLabel,
  verdictLabel,
  type Confidence,
  type OfferVerdict,
  type PriceStatus,
} from "@lvp/core";
import styles from "./ui.module.css";

const statusTone: Record<PriceStatus, string> = {
  confirmed: "good",
  observed: "neutral",
  historical: "muted",
  estimated: "info",
};

/** Nature du prix : confirmé, constaté, ancien ou estimé — toujours visible à côté d'un prix. */
export function StatusBadge({ status }: { status: PriceStatus }) {
  return (
    <span className={styles.badge} data-tone={statusTone[status]}>
      <span className={styles.dot} data-dashed={status === "estimated" || undefined} />
      {statusLabel[status]}
    </span>
  );
}

const verdictTone: Record<OfferVerdict, string> = {
  good_deal: "good",
  fair: "neutral",
  negligible: "muted",
  misleading: "danger",
  insufficient_data: "muted",
};

export function VerdictBadge({ verdict }: { verdict: OfferVerdict }) {
  return (
    <span className={styles.badge} data-tone={verdictTone[verdict]} data-solid>
      {verdictLabel[verdict]}
    </span>
  );
}

export function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  const filled = confidence.level === "high" ? 3 : confidence.level === "medium" ? 2 : 1;
  return (
    <span className={styles.confidence} title={`${confidenceLabel[confidence.level]} (${Math.round(confidence.score * 100)} %)`}>
      <span className={styles.bars} data-level={confidence.level} aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} data-on={i <= filled || undefined} />
        ))}
      </span>
      {confidenceLabel[confidence.level]}
    </span>
  );
}

export function ObservedAt({ iso, asOf }: { iso: string; asOf: string }) {
  return <time dateTime={iso}>{formatRelativeDay(iso, new Date(asOf))}</time>;
}

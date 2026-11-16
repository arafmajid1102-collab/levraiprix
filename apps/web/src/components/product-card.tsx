import { formatPrice, formatUnitPrice, type ProductView } from "@lvp/core";
import Link from "next/link";
import { ObservedAt, StatusBadge } from "./badges";
import styles from "./ui.module.css";

export function ProductCard({ view, asOf }: { view: ProductView; asOf: string }) {
  const { product, category, best, ranked, unranked } = view;
  const [amount, unit] = best?.unitPrice ? formatUnitPrice(best.unitPrice).split(" / ") : [];
  const fallback = unranked[0];
  return (
    <Link href={`/produit/${product.id}`} className={`${styles.card} ${styles.productCard}`}>
      <div>
        <p className="eyebrow">{category.name}</p>
        <h3>{product.name}</h3>
        <p className={styles.productMeta}>
          {product.brandName}
          {product.packaging ? ` · ${product.packaging}` : ""}
        </p>
      </div>
      {best ? (
        <>
          <div className={styles.priceRow}>
            <p className={`num ${styles.unitPrice}`}>
              {amount} <small>/ {unit}</small>
            </p>
            <p className="num muted">{formatPrice(best.observation.priceCents)}</p>
          </div>
          <div className={styles.cardFoot}>
            <StatusBadge status={best.status} />
            <span>
              {best.store.retailerName} · <ObservedAt iso={best.observation.observedAt} asOf={asOf} />
            </span>
            <span>
              {ranked.length} magasin{ranked.length > 1 ? "s" : ""} comparé{ranked.length > 1 ? "s" : ""}
            </span>
          </div>
        </>
      ) : (
        <div className={styles.cardFoot}>
          {fallback ? <StatusBadge status={fallback.status} /> : null}
          <span>Aucun prix constaté récemment : pas de classement possible.</span>
        </div>
      )}
    </Link>
  );
}

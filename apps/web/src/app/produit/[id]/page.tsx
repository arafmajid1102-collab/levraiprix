import {
  basisLabel,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatUnitPrice,
  methodLabel,
  type Offer,
} from "@lvp/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfidenceMeter, ObservedAt, StatusBadge, VerdictBadge } from "@/components/badges";
import { FavoriteButton, MyStoresOffer } from "@/components/favorites";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { ProductCard } from "@/components/product-card";
import ui from "@/components/ui.module.css";
import { comparableAlternatives, getCatalogSnapshot } from "@/lib/catalog";
import styles from "./product.module.css";

type Props = PageProps<"/produit/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { products } = await getCatalogSnapshot();
  return { title: products.find((p) => p.id === id)?.name ?? "Produit introuvable" };
}

function OfferRow({ offer, rank, best, asOf }: { offer: Offer; rank?: number; best?: Offer | null; asOf: string }) {
  const { assessment, observation } = offer;
  const gap =
    best && best !== offer && offer.unitPrice && best.unitPrice
      ? offer.unitPrice.cents / best.unitPrice.cents - 1
      : null;
  return (
    <li className={styles.offer} data-best={rank === 1 || undefined}>
      <div className={styles.rank}>{rank ? <span className="num">{rank}</span> : <span aria-hidden="true">—</span>}</div>
      <div className={styles.offerMain}>
        <div className={styles.offerTop}>
          <div>
            <h3>{offer.store.name}</h3>
            <p className={styles.offerMeta}>
              {offer.store.retailerName} · {methodLabel[observation.method]} ·{" "}
              <ObservedAt iso={observation.observedAt} asOf={asOf} />
            </p>
          </div>
          <div className={styles.offerPrice}>
            <p className={`num ${styles.offerUnit}`}>{offer.unitPrice ? formatUnitPrice(offer.unitPrice) : "Prix unitaire incalculable"}</p>
            <p className="num muted">
              {formatPrice(observation.priceCents)}
              {observation.promo?.claimedReferencePriceCents ? (
                <s className={styles.struck}>{formatPrice(observation.promo.claimedReferencePriceCents)}</s>
              ) : null}
            </p>
          </div>
        </div>
        <div className={styles.offerTags}>
          <StatusBadge status={offer.status} />
          <ConfidenceMeter confidence={offer.confidence} />
          {gap !== null && gap > 0.005 ? <span className={styles.gap}>{formatPercent(gap)} par rapport au moins cher</span> : null}
          {observation.promo || assessment.verdict === "misleading" ? <VerdictBadge verdict={assessment.verdict} /> : null}
        </div>
        {assessment.findings.length > 0 ? (
          <ul className={styles.findings}>
            {assessment.findings.map((f) => (
              <li key={f.code} data-tone={f.tone}>
                {f.message}
              </li>
            ))}
          </ul>
        ) : observation.promo && assessment.verdict === "insufficient_data" ? (
          <p className={styles.note}>
            Pas assez de relevés antérieurs dans ce magasin pour juger cette promotion.
          </p>
        ) : null}
        {assessment.evidence.usualUnitPrice ? (
          <p className={styles.note}>
            Prix habituel ici : <span className="num">{formatUnitPrice(assessment.evidence.usualUnitPrice)}</span>, d&apos;après{" "}
            {assessment.evidence.sampleSize} relevés sur {assessment.evidence.spanDays} jours.
          </p>
        ) : null}
        {offer.status === "estimated" ? (
          <p className={styles.note}>Ce montant est une estimation calculée : personne ne l&apos;a constaté en magasin.</p>
        ) : null}
      </div>
    </li>
  );
}

async function Product({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const { views, asOf } = await getCatalogSnapshot();
  const view = views.find((v) => v.product.id === id);
  if (!view) notFound();

  const { product, category, best, ranked, unranked, history } = view;
  const alternatives = comparableAlternatives(views, view);
  const basis = best?.unitPrice?.basis ?? category.comparisonBasis;
  const chartSeries = history
    .map((h) => ({ storeId: h.store.id, storeName: h.store.name, points: h.points }))
    .filter((s) => s.points.length > 1);

  return (
    <>
      <header className={`${styles.head} rise`}>
        <div className={styles.headText}>
          <Link href={`/recherche?categorie=${category.slug}`} className="eyebrow">
            {category.name}
          </Link>
          <h1>{product.name}</h1>
          <dl className={styles.facts}>
            <div>
              <dt>Marque</dt>
              <dd>{product.brandName}</dd>
            </div>
            <div>
              <dt>Contenu</dt>
              <dd>{formatQuantity(product.quantity)}</dd>
            </div>
            {product.barcode ? (
              <div>
                <dt>Code-barres</dt>
                <dd className="num">{product.barcode}</dd>
              </div>
            ) : null}
            <div>
              <dt>Comparé au</dt>
              <dd>{basisLabel[basis]}</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <FavoriteButton productId={product.id} />
            <Link href={`/contribuer?produit=${product.id}`} className={styles.contribute}>
              Ajouter un prix pour ce produit
            </Link>
          </div>
        </div>

        <div className={`${ui.card} ${styles.best}`}>
          {best?.unitPrice ? (
            <>
              <p className="eyebrow">Meilleur prix constaté</p>
              <p className={`num ${styles.bestPrice}`}>
                {formatUnitPrice(best.unitPrice).split(" / ")[0]}
                <small> / {basisLabel[best.unitPrice.basis]}</small>
              </p>
              <p className="muted">
                <span className="num">{formatPrice(best.observation.priceCents)}</span> chez {best.store.name}
              </p>
              <div className={styles.offerTags}>
                <StatusBadge status={best.status} />
                <ConfidenceMeter confidence={best.confidence} />
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">Pas de classement</p>
              <p className="muted">
                Aucun prix n&apos;a été constaté récemment pour ce produit. Les montants ci-dessous sont anciens ou
                estimés et ne permettent pas de désigner un meilleur prix.
              </p>
            </>
          )}
        </div>
      </header>

      {ranked.length > 0 ? (
        <section className={ui.section}>
          <div className={ui.sectionHead}>
            <h2>Où l&apos;acheter</h2>
            <p>Classé par prix au {basisLabel[basis]}, sur des prix constatés depuis moins de 30 jours</p>
          </div>
          <MyStoresOffer
            offers={ranked
              .filter((o) => o.unitPrice)
              .map((o) => ({
                storeId: o.store.id,
                storeLabel: `${o.store.retailerName === "Indépendant" ? "" : `${o.store.retailerName} — `}${o.store.name}`,
                unitPrice: formatUnitPrice(o.unitPrice!),
                price: formatPrice(o.observation.priceCents),
              }))}
          />
          <ol className={styles.offers}>
            {ranked.map((o, i) => (
              <OfferRow key={o.observation.id} offer={o} rank={i + 1} best={best} asOf={asOf} />
            ))}
          </ol>
        </section>
      ) : null}

      {unranked.length > 0 ? (
        <section className={ui.section}>
          <div className={ui.sectionHead}>
            <h2>Hors classement</h2>
            <p>Prix anciens ou estimés : à titre indicatif seulement</p>
          </div>
          <ul className={styles.offers}>
            {unranked.map((o) => (
              <OfferRow key={o.observation.id} offer={o} asOf={asOf} />
            ))}
          </ul>
        </section>
      ) : null}

      {chartSeries.length > 0 ? (
        <section className={ui.section}>
          <div className={ui.sectionHead}>
            <h2>Historique des prix</h2>
            <p>Prix au {basisLabel[basis]}</p>
          </div>
          <PriceHistoryChart series={chartSeries} basis={basis} />
        </section>
      ) : null}

      {alternatives.length > 0 ? (
        <section className={ui.section}>
          <div className={ui.sectionHead}>
            <h2>Alternatives comparables</h2>
            <p>Même catégorie, même unité de comparaison, de la moins chère à la plus chère</p>
          </div>
          <div className={ui.grid}>
            {alternatives.map((v) => (
              <ProductCard key={v.product.id} view={v} asOf={asOf} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ProductSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement de la fiche produit" style={{ display: "grid", gap: 24 }}>
      <div className="skeleton" style={{ height: 200 }} />
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}

export default function ProductPage({ params }: Props) {
  return (
    <main className="page">
      <Suspense fallback={<ProductSkeleton />}>
        <Product params={params} />
      </Suspense>
    </main>
  );
}

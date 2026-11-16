import { brand } from "@lvp/design-system";
import { formatPrice, formatUnitPrice, type Offer } from "@lvp/core";
import Link from "next/link";
import { VerdictBadge } from "@/components/badges";
import { ArrowIcon } from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import { FavoritesList } from "@/components/favorites";
import { SearchForm } from "@/components/search-form";
import ui from "@/components/ui.module.css";
import { getCatalogSnapshot, offersByVerdict } from "@/lib/catalog";
import styles from "./home.module.css";

function Signal({ offer }: { offer: Offer }) {
  const finding = offer.assessment.findings.find((f) => f.tone === "danger") ?? offer.assessment.findings[0];
  return (
    <li>
      <Link href={`/produit/${offer.product.id}`} className={`${ui.card} ${styles.signal}`}>
        <div className={styles.signalHead}>
          <VerdictBadge verdict={offer.assessment.verdict} />
          <span className="num muted">
            {formatPrice(offer.observation.priceCents)}
            {offer.unitPrice ? ` · ${formatUnitPrice(offer.unitPrice)}` : ""}
          </span>
        </div>
        <h3>{offer.product.name}</h3>
        <p className={styles.signalStore}>{offer.store.name}</p>
        {finding ? <p className={styles.signalWhy}>{finding.message}</p> : null}
      </Link>
    </li>
  );
}

export default async function HomePage() {
  const { views, categories, asOf } = await getCatalogSnapshot();
  const misleading = offersByVerdict(views, "misleading");
  const good = offersByVerdict(views, "good_deal");
  const featured = views.filter((v) => v.ranked.length >= 2).slice(0, 6);

  return (
    <main className="page">
      <section className={`${styles.hero} rise`}>
        <p className="eyebrow">Produits d&apos;entretien · France</p>
        <h1>
          Le prix affiché n&apos;est pas <em>le vrai prix</em>.
        </h1>
        <p className={styles.lede}>{brand.tagline}</p>
        <SearchForm />
        <ul className={ui.chips}>
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/recherche?categorie=${c.slug}`} className={ui.chip}>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <FavoritesList compact />

      {views.length === 0 ? (
        <section className={ui.empty}>
          <h2>Le catalogue est encore vide</h2>
          <p>La base est connectée, mais aucun produit n&apos;y a encore été ajouté.</p>
          <Link href="/contribuer" className={ui.button}>
            Ajouter un premier prix
          </Link>
        </section>
      ) : null}

      {misleading.length > 0 ? (
        <section className={ui.section}>
          <div className={ui.sectionHead}>
            <h2>Offres qui ne tiennent pas</h2>
            <p>Détectées en comparant l&apos;offre à l&apos;historique constaté du même magasin</p>
          </div>
          <ul className={styles.signals}>
            {misleading.map((o) => (
              <Signal key={o.observation.id} offer={o} />
            ))}
          </ul>
        </section>
      ) : null}

      {good.length > 0 ? (
        <section className={ui.section}>
          <div className={ui.sectionHead}>
            <h2>Vraies bonnes affaires</h2>
            <p>Au moins 10 % sous le prix unitaire habituel</p>
          </div>
          <ul className={styles.signals}>
            {good.map((o) => (
              <Signal key={o.observation.id} offer={o} />
            ))}
          </ul>
        </section>
      ) : null}

      {featured.length > 0 ? (
      <section className={ui.section}>
        <div className={ui.sectionHead}>
          <h2>Comparés dans plusieurs magasins</h2>
          <Link href="/recherche" className={styles.more}>
            Tout le catalogue <ArrowIcon width={16} height={16} />
          </Link>
        </div>
        <div className={ui.grid}>
          {featured.map((v) => (
            <ProductCard key={v.product.id} view={v} asOf={asOf} />
          ))}
        </div>
      </section>
      ) : null}
    </main>
  );
}

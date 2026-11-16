import { isValidGtin, normalizeBarcode } from "@lvp/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProductCard } from "@/components/product-card";
import { SearchForm } from "@/components/search-form";
import ui from "@/components/ui.module.css";
import { getCatalogSnapshot, searchProducts } from "@/lib/catalog";

export const metadata: Metadata = { title: "Prix" };

type Params = PageProps<"/recherche">["searchParams"];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Search({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 80);
  const categorySlug = first(params.categorie);
  const { categories, products, asOf } = await getCatalogSnapshot();

  // Une saisie qui ressemble à un code-barres valide mène droit à la fiche.
  const code = normalizeBarcode(q);
  const isBarcode = code.length >= 8 && code.length === q.replace(/\s/g, "").length;
  if (isBarcode && isValidGtin(code)) {
    const match = products.find((p) => p.barcode === code);
    if (match) redirect(`/produit/${match.id}`);
  }

  const results = await searchProducts(q, categorySlug || undefined);
  const href = (slug?: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (slug) sp.set("categorie", slug);
    const qs = sp.toString();
    return qs ? `/recherche?${qs}` : "/recherche";
  };

  return (
    <>
      <SearchForm defaultValue={q} category={categorySlug || undefined} />
      <ul className={ui.chips}>
        <li>
          <Link href={href()} className={ui.chip} aria-current={!categorySlug}>
            Toutes
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={href(c.slug)} className={ui.chip} aria-current={c.slug === categorySlug}>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>

      {results.length > 0 ? (
        <section className={ui.section} aria-live="polite">
          <p className="muted">
            {results.length} produit{results.length > 1 ? "s" : ""}
            {q ? ` pour « ${q} »` : ""}
          </p>
          <div className={ui.grid}>
            {results.map((v) => (
              <ProductCard key={v.product.id} view={v} asOf={asOf} />
            ))}
          </div>
        </section>
      ) : (
        <section className={ui.empty} aria-live="polite">
          <h2>Aucun produit trouvé</h2>
          {isBarcode ? (
            <p>
              {isValidGtin(code)
                ? `Le code-barres ${code} n'est pas encore dans le catalogue.`
                : `« ${q} » n'est pas un code-barres valide : vérifiez les chiffres.`}
            </p>
          ) : (
            <p>
              Rien ne correspond à cette recherche{categorySlug ? " dans cette catégorie" : ""}. Essayez un terme plus
              général, comme « lessive » ou « éponges ».
            </p>
          )}
          {isBarcode && isValidGtin(code) ? (
            <Link href={`/contribuer?code=${code}`} className={ui.button}>
              Ajouter ce produit
            </Link>
          ) : null}
          <Link href="/recherche" className={ui.chip}>
            Voir tout le catalogue
          </Link>
        </section>
      )}
    </>
  );
}

function SearchSkeleton() {
  return (
    <div className={ui.grid} aria-busy="true" aria-label="Chargement des résultats">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton" style={{ height: 220 }} />
      ))}
    </div>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/recherche">) {
  return (
    <main className="page">
      <header className={ui.pageHead}>
        <h1>Prix</h1>
        <p>Cherchez un produit par nom, marque ou code-barres. Les résultats sont comparés au prix unitaire.</p>
      </header>
      <Suspense fallback={<SearchSkeleton />}>
        <Search searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

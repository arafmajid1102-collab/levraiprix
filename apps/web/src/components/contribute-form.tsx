"use client";

import { formatQuantity, type BrandType, type ContentUnit } from "@lvp/core";
import {
  contentUnitLabel,
  getContributableProduct,
  listContributableStores,
  proofKindLabel,
  proposeProduct,
  proposeStore,
  reviewSubmission,
  searchContributableProducts,
  submitPrice,
  toDateInput,
  uploadProof,
  validatePriceDraft,
  validateProductDraft,
  validateStoreDraft,
  type ContributableProduct,
  type ContributableStore,
  type PriceDraft,
  type ProductDraft,
  type ProofKind,
  type StoreDraft,
} from "@lvp/data-supabase";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "@/lib/account";
import { refreshCatalog } from "@/lib/actions";
import { prepareProofPhoto } from "@/lib/photo";
import auth from "./auth.module.css";
import styles from "./contribute.module.css";
import { MySubmissions } from "./my-submissions";
import ui from "./ui.module.css";

export interface CategoryOption {
  id: string;
  name: string;
  countsWashes: boolean;
}

type Notice = { tone: "error" | "good" | "info"; text: string } | null;

const NEW_STORE = "__new__";
const emptyProduct: ProductDraft = {
  name: "",
  brand: "",
  brandType: "national",
  categoryId: "",
  barcode: "",
  amount: "",
  unit: "l",
  packCount: "",
  usesCount: "",
};
const emptyStore: StoreDraft = { retailer: "", name: "", postalCode: "", city: "" };
const emptyPrice = (): PriceDraft => ({ price: "", observedOn: toDateInput(new Date()), isPromo: false, referencePrice: "", promoLabel: "" });

const storeLabel = (s: ContributableStore) =>
  `${s.retailerName === "Indépendant" ? "" : `${s.retailerName} — `}${s.name}, ${s.postalCode} ${s.city}${s.pending ? " (en attente)" : ""}`;

/** Saisie d'un prix : produit (existant ou nouveau), magasin (existant ou nouveau), prix. */
export function ContributeForm({ categories }: { categories: CategoryOption[] }) {
  const account = useAccount();
  const searchParams = useSearchParams();
  const preselected = searchParams.get("produit");
  // Code-barres transmis par le scanner : le produit est inconnu, on ouvre directement sa création.
  const scanned = /^\d{8,14}$/.test(searchParams.get("code") ?? "") ? searchParams.get("code")! : "";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContributableProduct[] | null>(null);
  const [product, setProduct] = useState<ContributableProduct | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(scanned !== "");
  const [productDraft, setProductDraft] = useState<ProductDraft>({ ...emptyProduct, barcode: scanned });

  const [stores, setStores] = useState<ContributableStore[] | null>(null);
  const [storeId, setStoreId] = useState("");
  const [storeDraft, setStoreDraft] = useState<StoreDraft>(emptyStore);

  const [price, setPrice] = useState<PriceDraft>(emptyPrice);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [proofKind, setProofKind] = useState<ProofKind>("shelf_label");
  const [photoKey, setPhotoKey] = useState(0);
  const [publishNow, setPublishNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [sent, setSent] = useState(0);

  const client = account.status === "signedIn" ? account.client : null;

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    listContributableStores(client).then((result) => {
      if (cancelled) return;
      if (result.ok) setStores(result.value);
      else setNotice({ tone: "error", text: result.message });
    });
    if (preselected) {
      getContributableProduct(client, preselected).then((found) => !cancelled && found && setProduct(found));
    }
    return () => {
      cancelled = true;
    };
  }, [client, preselected]);

  if (account.status === "unavailable") {
    return <p className={ui.empty}>La contribution n&apos;est pas disponible en mode démonstration : aucune base de données n&apos;est connectée.</p>;
  }
  if (account.status === "loading") {
    return <p className={auth.note} aria-busy="true">Chargement…</p>;
  }
  if (account.status === "signedOut") {
    return (
      <section className={ui.empty}>
        <h2>Connectez-vous pour ajouter un prix</h2>
        <p>Un compte est nécessaire pour contribuer : chaque relevé est relu avant d&apos;être publié.</p>
        <div className={auth.row}>
          <Link href="/connexion" className={ui.button}>
            Se connecter
          </Link>
          <Link href="/inscription" className={auth.secondary}>
            Créer un compte
          </Link>
        </div>
      </section>
    );
  }

  const { userId, moderator } = account;
  const session = account.client;
  const category = categories.find((c) => c.id === productDraft.categoryId);
  const addingStore = storeId === NEW_STORE || stores?.length === 0;

  async function search(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    setNotice(null);
    const result = await searchContributableProducts(session, query);
    setBusy(false);
    if (result.ok) setResults(result.value);
    else setNotice({ tone: "error", text: result.message });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const stop = (text: string) => setNotice({ tone: "error", text });
    setNotice(null);

    // Tout est contrôlé avant le premier envoi : rien n'est créé si une saisie est fausse.
    if (!product && !creatingProduct) return stop("Choisissez un produit, ou ajoutez-le s'il n'existe pas encore.");
    const newProduct = product ? null : validateProductDraft(productDraft);
    if (newProduct && !newProduct.ok) return stop(newProduct.message);
    if (!addingStore && !storeId) return stop("Choisissez le magasin où vous avez vu ce prix.");
    const newStore = addingStore ? validateStoreDraft(storeDraft) : null;
    if (newStore && !newStore.ok) return stop(newStore.message);
    const checkedPrice = validatePriceDraft(price);
    if (!checkedPrice.ok) return stop(checkedPrice.message);

    setBusy(true);
    try {
      let productId = product?.id;
      let quantity = product?.quantity;
      if (newProduct?.ok) {
        const created = await proposeProduct(session, newProduct.value);
        if (!created.ok) return stop(created.message);
        productId = created.value;
        // Si le code-barres existait déjà, c'est la fiche existante qui fait foi.
        const saved = await getContributableProduct(session, created.value);
        quantity = saved?.quantity ?? {
          amount: newProduct.value.amount,
          unit: newProduct.value.unit,
          packCount: newProduct.value.packCount,
          ...(newProduct.value.usesCount ? { usesCount: newProduct.value.usesCount } : {}),
        };
        if (saved) setProduct(saved);
        setCreatingProduct(false);
      }
      let finalStoreId = storeId;
      if (newStore?.ok) {
        const created = await proposeStore(session, newStore.value);
        if (!created.ok) return stop(created.message);
        finalStoreId = created.value;
        const refreshed = await listContributableStores(session);
        if (refreshed.ok) setStores(refreshed.value);
        setStoreId(finalStoreId);
        setStoreDraft(emptyStore);
      }
      let proof: { path: string; kind: ProofKind } | undefined;
      if (photo) {
        const uploaded = await uploadProof(session, userId, photo, "image/jpeg");
        if (!uploaded.ok) return stop(uploaded.message);
        proof = { path: uploaded.value, kind: proofKind };
      }
      const saved = await submitPrice(session, { userId, productId: productId!, storeId: finalStoreId, quantity: quantity!, price: checkedPrice.value, proof });
      if (!saved.ok) return stop(saved.message);

      let published = false;
      if (moderator && publishNow) {
        const review = await reviewSubmission(session, saved.value, true);
        published = review.ok;
        if (published) await refreshCatalog();
      }
      setPrice(emptyPrice());
      setPhoto(null);
      setPhotoName("");
      setPhotoKey((n) => n + 1);
      setSent((n) => n + 1);
      setNotice(
        published
          ? { tone: "good", text: "Prix publié. Il est visible dans le catalogue." }
          : { tone: "good", text: "Merci ! Votre relevé est enregistré. Il sera visible de tous après validation." },
      );
    } finally {
      setBusy(false);
    }
  }

  const setP = (patch: Partial<ProductDraft>) => setProductDraft((d) => ({ ...d, ...patch }));
  const setS = (patch: Partial<StoreDraft>) => setStoreDraft((d) => ({ ...d, ...patch }));
  const setV = (patch: Partial<PriceDraft>) => setPrice((d) => ({ ...d, ...patch }));

  return (
    <div className={styles.layout}>
      <form onSubmit={submit} noValidate className={styles.layout}>
        <fieldset className={`${ui.card} ${styles.step}`}>
          <h2>
            <span>1</span> Le produit
          </h2>
          {product ? (
            <div className={styles.chosen}>
              <div>
                <strong>{product.name}</strong>
                <small>
                  {product.brandName} · {formatQuantity(product.quantity)}
                  {product.pending ? " · en attente de validation" : ""}
                </small>
              </div>
              <button type="button" className={auth.secondary} onClick={() => setProduct(null)} disabled={busy}>
                Changer
              </button>
            </div>
          ) : creatingProduct ? (
            <>
              <div className={auth.field}>
                <label htmlFor="p-name">Nom du produit</label>
                <input id="p-name" className={auth.input} value={productDraft.name} onChange={(e) => setP({ name: e.target.value })} maxLength={200} />
                <small>Tel qu&apos;il figure sur l&apos;emballage.</small>
              </div>
              <div className={styles.grid}>
                <div className={auth.field}>
                  <label htmlFor="p-brand">Marque</label>
                  <input id="p-brand" className={auth.input} value={productDraft.brand} onChange={(e) => setP({ brand: e.target.value })} maxLength={80} />
                </div>
                <div className={auth.field}>
                  <label htmlFor="p-brand-type">Type de marque</label>
                  <select id="p-brand-type" className={auth.input} value={productDraft.brandType} onChange={(e) => setP({ brandType: e.target.value as BrandType })}>
                    <option value="national">Marque nationale</option>
                    <option value="private_label">Marque de distributeur</option>
                  </select>
                </div>
              </div>
              <div className={styles.grid}>
                <div className={auth.field}>
                  <label htmlFor="p-category">Catégorie</label>
                  <select id="p-category" className={auth.input} value={productDraft.categoryId} onChange={(e) => setP({ categoryId: e.target.value })}>
                    <option value="">Choisir…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={auth.field}>
                  <label htmlFor="p-barcode">Code-barres (facultatif)</label>
                  <input id="p-barcode" className={auth.input} value={productDraft.barcode} onChange={(e) => setP({ barcode: e.target.value })} inputMode="numeric" maxLength={18} />
                </div>
              </div>
              <div className={styles.grid}>
                <div className={auth.field}>
                  <label htmlFor="p-amount">Contenance</label>
                  <input id="p-amount" className={auth.input} value={productDraft.amount} onChange={(e) => setP({ amount: e.target.value })} inputMode="decimal" placeholder="1,5" />
                </div>
                <div className={auth.field}>
                  <label htmlFor="p-unit">Unité</label>
                  <select id="p-unit" className={auth.input} value={productDraft.unit} onChange={(e) => setP({ unit: e.target.value as ContentUnit })}>
                    {(Object.keys(contentUnitLabel) as ContentUnit[]).map((unit) => (
                      <option key={unit} value={unit}>
                        {contentUnitLabel[unit]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={auth.field}>
                  <label htmlFor="p-pack">Articles dans le lot</label>
                  <input id="p-pack" className={auth.input} value={productDraft.packCount} onChange={(e) => setP({ packCount: e.target.value })} inputMode="numeric" placeholder="1" />
                </div>
                {category?.countsWashes ? (
                  <div className={auth.field}>
                    <label htmlFor="p-uses">Nombre de lavages</label>
                    <input id="p-uses" className={auth.input} value={productDraft.usesCount} onChange={(e) => setP({ usesCount: e.target.value })} inputMode="numeric" />
                    <small>Indiqué sur l&apos;emballage, par article.</small>
                  </div>
                ) : null}
              </div>
              <div>
                <button type="button" className={auth.secondary} onClick={() => setCreatingProduct(false)} disabled={busy}>
                  Revenir à la recherche
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={auth.field}>
                <label htmlFor="p-search">Nom du produit ou code-barres</label>
                <div className={styles.searchRow}>
                  <input
                    id="p-search"
                    className={auth.input}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void search(e);
                    }}
                    enterKeyHint="search"
                  />
                  <button type="button" className={auth.secondary} onClick={search} disabled={busy}>
                    Chercher
                  </button>
                  <Link href="/scanner" className={auth.secondary}>
                    Scanner
                  </Link>
                </div>
              </div>
              {results ? (
                results.length > 0 ? (
                  <ul className={styles.results}>
                    {results.map((p) => (
                      <li key={p.id}>
                        <button type="button" className={styles.result} onClick={() => setProduct(p)}>
                          <strong>{p.name}</strong>
                          <small>
                            {p.brandName} · {formatQuantity(p.quantity)}
                            {p.pending ? " · en attente de validation" : ""}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={auth.note}>Aucun produit trouvé.</p>
                )
              ) : null}
              <div>
                <button
                  type="button"
                  className={auth.secondary}
                  disabled={busy}
                  onClick={() => {
                    setCreatingProduct(true);
                    setP(/^\d{8,14}$/.test(query.trim()) ? { barcode: query.trim() } : { name: query.trim() });
                  }}
                >
                  Mon produit n&apos;est pas dans la liste
                </button>
              </div>
            </>
          )}
        </fieldset>

        <fieldset className={`${ui.card} ${styles.step}`}>
          <h2>
            <span>2</span> Le magasin
          </h2>
          {stores === null ? (
            <p className={auth.note}>Chargement des magasins…</p>
          ) : (
            <>
              {stores.length > 0 ? (
                <div className={auth.field}>
                  <label htmlFor="s-select">Magasin où vous avez vu ce prix</label>
                  <select id="s-select" className={auth.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    <option value="">Choisir…</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {storeLabel(s)}
                      </option>
                    ))}
                    <option value={NEW_STORE}>Ajouter un magasin…</option>
                  </select>
                </div>
              ) : (
                <p className={auth.note}>Aucun magasin n&apos;est encore enregistré : ajoutez le vôtre.</p>
              )}
              {addingStore ? (
                <div className={styles.grid}>
                  <div className={auth.field}>
                    <label htmlFor="s-retailer">Enseigne</label>
                    <input id="s-retailer" className={auth.input} value={storeDraft.retailer} onChange={(e) => setS({ retailer: e.target.value })} maxLength={80} />
                    <small>Laissez vide pour un commerce indépendant.</small>
                  </div>
                  <div className={auth.field}>
                    <label htmlFor="s-name">Nom du magasin</label>
                    <input id="s-name" className={auth.input} value={storeDraft.name} onChange={(e) => setS({ name: e.target.value })} maxLength={120} />
                    <small>Par exemple le quartier ou la rue.</small>
                  </div>
                  <div className={auth.field}>
                    <label htmlFor="s-postal">Code postal</label>
                    <input id="s-postal" className={auth.input} value={storeDraft.postalCode} onChange={(e) => setS({ postalCode: e.target.value })} inputMode="numeric" maxLength={5} autoComplete="postal-code" />
                  </div>
                  <div className={auth.field}>
                    <label htmlFor="s-city">Ville</label>
                    <input id="s-city" className={auth.input} value={storeDraft.city} onChange={(e) => setS({ city: e.target.value })} maxLength={80} autoComplete="address-level2" />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </fieldset>

        <fieldset className={`${ui.card} ${styles.step}`}>
          <h2>
            <span>3</span> Le prix
          </h2>
          <div className={styles.grid}>
            <div className={auth.field}>
              <label htmlFor="v-price">Prix affiché (€)</label>
              <input id="v-price" className={auth.input} value={price.price} onChange={(e) => setV({ price: e.target.value })} inputMode="decimal" placeholder="3,49" />
              <small>Le prix du conditionnement entier, pas le prix au litre.</small>
            </div>
            <div className={auth.field}>
              <label htmlFor="v-date">Date du relevé</label>
              <input id="v-date" className={auth.input} type="date" value={price.observedOn} max={toDateInput(new Date())} onChange={(e) => setV({ observedOn: e.target.value })} />
            </div>
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={price.isPromo} onChange={(e) => setV({ isPromo: e.target.checked })} />
            Ce prix était présenté comme une promotion
          </label>
          {price.isPromo ? (
            <div className={styles.grid}>
              <div className={auth.field}>
                <label htmlFor="v-ref">Prix barré annoncé (€)</label>
                <input id="v-ref" className={auth.input} value={price.referencePrice} onChange={(e) => setV({ referencePrice: e.target.value })} inputMode="decimal" />
                <small>Facultatif. Il sert à vérifier si la promotion est réelle.</small>
              </div>
              <div className={auth.field}>
                <label htmlFor="v-label">Mention de la promotion</label>
                <input id="v-label" className={auth.input} value={price.promoLabel} onChange={(e) => setV({ promoLabel: e.target.value })} maxLength={80} placeholder="−30 %, 2+1 offert…" />
              </div>
            </div>
          ) : null}
          <div className={auth.field}>
            <label htmlFor="v-photo">Photo de l&apos;étiquette ou du ticket (facultatif)</label>
            <input
              key={photoKey}
              id="v-photo"
              className={auth.input}
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setPhoto(null);
                setPhotoName("");
                if (!file) return;
                try {
                  setPhoto(await prepareProofPhoto(file));
                  setPhotoName(file.name);
                  setNotice(null);
                } catch (reason) {
                  e.target.value = "";
                  setNotice({ tone: "error", text: reason instanceof Error ? reason.message : "Cette image n'a pas pu être lue." });
                }
              }}
            />
            <small>
              Avec une photo, le prix peut être affiché comme « confirmé ». Elle n&apos;est vue que par vous et par
              la personne qui valide ; les données de localisation de l&apos;image sont retirées avant l&apos;envoi.
            </small>
          </div>
          {photo ? (
            <div className={auth.field}>
              <label htmlFor="v-kind">Que montre la photo « {photoName} » ?</label>
              <select id="v-kind" className={auth.input} value={proofKind} onChange={(e) => setProofKind(e.target.value as ProofKind)}>
                {(Object.keys(proofKindLabel) as ProofKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {proofKindLabel[kind]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {moderator ? (
            <label className={styles.check}>
              <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
              Publier immédiatement (vous êtes modérateur)
            </label>
          ) : null}
          {notice ? (
            <p className={auth.message} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
              {notice.text}
            </p>
          ) : null}
          <div>
            <button type="submit" className={ui.button} disabled={busy}>
              {busy ? "Envoi…" : "Envoyer ce prix"}
            </button>
          </div>
          {photo ? null : (
            <p className={auth.note}>
              Sans photo de l&apos;étiquette ou du ticket, ce relevé est affiché comme « prix constaté » et non « prix
              confirmé ».
            </p>
          )}
        </fieldset>
      </form>

      <MySubmissions client={session} userId={userId} refreshKey={sent} />
    </div>
  );
}

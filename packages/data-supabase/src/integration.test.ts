/**
 * Test d'intégration contre un Supabase RÉEL (local, dans Docker).
 * Ignoré tant que les variables LVP_SUPABASE_* ne sont pas fournies ;
 * lancé par `pnpm test:integration` à la racine.
 *
 * La clé secrète n'est utilisée qu'ici, côté script, pour préparer puis
 * nettoyer les lignes de test. Elle ne figure dans aucun fichier du dépôt.
 */
import { buildProductView } from "@lvp/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  changePassword,
  createPersonalStore,
  createPublicClient,
  createSessionClient,
  createSupabaseCatalog,
  deleteAccount,
  dropSessionIfAccountGone,
  exportAccountData,
  getProofUrl,
  isModerator,
  listMySubmissions,
  listPendingSubmissions,
  proposeProduct,
  proposeStore,
  reviewSubmission,
  searchContributableProducts,
  submitPrice,
  validatePriceDraft,
  validateProductDraft,
  validateStoreDraft,
  toDateInput,
  uploadProof,
  readSupabaseConfig,
  requestLoginCode,
  signInWithPassword,
  signOut,
  signUp,
  verifyCode,
} from "./index";

const url = process.env.LVP_SUPABASE_URL;
const publicKey = process.env.LVP_SUPABASE_PUBLIC_KEY;
const secretKey = process.env.LVP_SUPABASE_SECRET_KEY;
const mailpit = process.env.LVP_MAILPIT_URL;
const tag = `test-${Date.now()}`;

/** Boîte de test locale (Mailpit) : aucun e-mail ne sort de la machine. */
async function mailbox(address: string): Promise<{ ID: string }[]> {
  const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  return ((await res.json()) as { messages: { ID: string }[] }).messages;
}

const mailCount = async (address: string) => (await mailbox(address)).length;

/** Attend le n-ième e-mail reçu par l'adresse et en extrait le code à six chiffres. */
async function mailedCode(address: string, expected: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const messages = await mailbox(address);
    if (messages.length >= expected) {
      const res = await fetch(`${mailpit}/api/v1/message/${messages[0]!.ID}`);
      const { Text } = (await res.json()) as { Text: string };
      const code = /\b\d{6}\b/.exec(Text)?.[0];
      if (!code) throw new Error(`Aucun code dans l'e-mail : ${Text}`);
      return code;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`E-mail n°${expected} jamais reçu par ${address}`);
}

describe.skipIf(!url || !publicKey || !secretKey || !mailpit)("Supabase réel", () => {
  // Créés dans beforeAll : le corps de ce bloc est évalué même quand la suite est ignorée.
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const ids: Record<string, string> = {};
  // Supprimés dans afterAll, même si un test échoue en cours de route.
  const createdUsers: string[] = [];
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  async function insert(table: string, row: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin.from(table).insert(row).select("id").single();
    if (error) throw new Error(`${table} : ${error.message}`);
    return data.id as string;
  }

  beforeAll(async () => {
    admin = createClient(url!, secretKey!, { auth: { persistSession: false } });
    anon = createPublicClient(readSupabaseConfig(url, publicKey)!);
    const { data: category } = await admin.from("categories").select("id").eq("slug", "lessives").single();
    ids.category = category!.id;
    ids.brand = await insert("brands", { name: `Marque ${tag}`, brand_type: "national" });
    ids.source = await insert("data_sources", { slug: tag, name: `Source ${tag}` });
    ids.retailer = await insert("retailers", { name: `Enseigne ${tag}` });
    ids.storeA = await insert("stores", { retailer_id: ids.retailer, name: `A ${tag}`, postal_code: "75011", city: "Paris" });
    ids.storeB = await insert("stores", { retailer_id: ids.retailer, name: `B ${tag}`, postal_code: "75012", city: "Paris" });
    ids.product = await insert("products", {
      name: `Lessive ${tag}`,
      brand_id: ids.brand,
      category_id: ids.category,
      quantity_amount: 1.5,
      quantity_unit: "l",
      uses_count: 30,
    });
    const observation = (store: string, days: number, price: number, extra = {}) => ({
      product_id: ids.product,
      store_id: store,
      observed_at: daysAgo(days),
      price_cents: price,
      quantity_amount: 1.5,
      quantity_unit: "l",
      uses_count: 30,
      source_id: ids.source,
      method: "receipt",
      review_status: "accepted",
      // Insertion groupée : toutes les lignes doivent avoir les mêmes colonnes.
      is_promo: false,
      promo_reference_price_cents: null,
      ...extra,
    });
    const { error } = await admin.from("price_observations").insert([
      ...[80, 60, 40, 20, 10].map((d) => observation(ids.storeA!, d, 900)),
      observation(ids.storeA!, 1, 720, { is_promo: true, promo_reference_price_cents: 900 }),
      observation(ids.storeB!, 3, 870),
      observation(ids.storeB!, 2, 100, { review_status: "pending" }),
    ]);
    if (error) throw new Error(error.message);
  });

  afterAll(async () => {
    await admin.from("products").delete().eq("id", ids.product);
    await admin.from("stores").delete().eq("retailer_id", ids.retailer);
    await admin.from("retailers").delete().eq("id", ids.retailer);
    await admin.from("brands").delete().eq("id", ids.brand);
    await admin.from("data_sources").delete().eq("id", ids.source);
    if (ids.user) await admin.auth.admin.deleteUser(ids.user);
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  });

  it("lit le catalogue avec la seule clé publique", async () => {
    const catalog = createSupabaseCatalog(anon, now);
    expect(catalog.dataset.kind).toBe("live");
    expect((await catalog.listCategories()).map((c) => c.slug)).toContain("sacs-poubelle");
    const found = await catalog.searchProducts({ text: `lessive ${tag}` });
    expect(found.map((p) => p.id)).toEqual([ids.product]);
    expect(found[0]!.quantity).toEqual({ amount: 1.5, unit: "l", packCount: 1, usesCount: 30 });
  });

  it("ne sert que les relevés validés et produit le bon classement", async () => {
    const catalog = createSupabaseCatalog(anon, now);
    const product = (await catalog.getProduct(ids.product!))!;
    const category = (await catalog.listCategories()).find((c) => c.id === product.categoryId)!;
    const observations = await catalog.listObservations(product.id);
    expect(observations).toHaveLength(7); // le relevé « pending » à 1,00 € est invisible
    const view = buildProductView(product, category, await catalog.listStores(), observations, now);
    expect(view.ranked.map((o) => o.store.id)).toEqual([ids.storeA, ids.storeB]);
    expect(view.best!.unitPrice).toEqual({ basis: "per_wash", cents: 24 });
    expect(view.best!.assessment.verdict).toBe("good_deal");
  });

  it("refuse toute écriture anonyme", async () => {
    const { error } = await anon.from("products").update({ name: "piraté" }).eq("id", ids.product);
    expect(error?.message).toMatch(/permission denied/);
  });

  it("déroule le parcours de compte complet avec le code reçu par e-mail", async () => {
    const config = readSupabaseConfig(url, publicKey)!;
    const memory = new Map<string, string>();
    const user = createSessionClient(config, {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => void memory.set(k, v),
      removeItem: (k) => void memory.delete(k),
    });
    const email = `${tag}@exemple.test`;
    const password = `Mdp-${tag}-Long!`;

    // Inscription : pas de session tant que l'adresse n'est pas confirmée.
    expect(await signUp(user, email, "court")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await signUp(user, email, password)).toEqual({ ok: true });
    expect((await user.auth.getSession()).data.session).toBeNull();
    expect(await signInWithPassword(user, email, password)).toMatchObject({ ok: false, reason: "unconfirmed" });

    const signupCode = await mailedCode(email, 1);
    const wrong = signupCode === "000000" ? "111111" : "000000";
    expect(await verifyCode(user, email, wrong, "signup")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await verifyCode(user, email, signupCode, "signup")).toEqual({ ok: true });
    ids.user = (await user.auth.getUser()).data.user!.id;
    expect(memory.size).toBeGreaterThan(0); // la session est bien confiée au stockage fourni

    const { data: profile } = await user.from("profiles").select("id");
    expect(profile).toEqual([{ id: ids.user }]);

    // Contribution : en attente, impossible à valider soi-même, invisible du public.
    const mine = {
      product_id: ids.product,
      store_id: ids.storeB,
      observed_at: now.toISOString(),
      price_cents: 850,
      quantity_amount: 1.5,
      quantity_unit: "l",
      source_id: ids.source,
      method: "community_report",
      submitted_by: ids.user,
    };
    expect((await user.from("price_observations").insert(mine)).error).toBeNull();
    const cheat = await user.from("price_observations").insert({ ...mine, review_status: "accepted" });
    expect(cheat.error?.message).toMatch(/row-level security/);
    expect(await createSupabaseCatalog(anon, now).listObservations(ids.product!)).toHaveLength(7);

    // Export des données personnelles.
    const exported = await exportAccountData(user);
    expect(exported.account).toMatchObject({ id: ids.user, email });
    expect(exported.profile).toMatchObject({ id: ids.user });
    expect(exported.priceSubmissions).toHaveLength(1);

    // Déconnexion, puis connexion par code.
    expect(await signOut(user)).toEqual({ ok: true });
    expect((await user.auth.getSession()).data.session).toBeNull();
    await new Promise((r) => setTimeout(r, 1500)); // un e-mail par seconde au plus par adresse
    expect(await requestLoginCode(user, email)).toEqual({ ok: true });
    expect(await verifyCode(user, email, await mailedCode(email, 2), "login")).toEqual({ ok: true });

    // Une adresse inconnue ne crée aucun compte et ne reçoit rien.
    const stranger = `inconnu-${tag}@exemple.test`;
    expect(await requestLoginCode(anon, stranger)).toEqual({ ok: true });
    expect(await mailCount(stranger)).toBe(0);

    // Changement de mot de passe.
    const next = `Nouveau-${tag}-Mdp!`;
    expect(await changePassword(user, next)).toEqual({ ok: true });
    await signOut(user);
    expect(await signInWithPassword(user, email, password)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await signInWithPassword(user, email, next)).toEqual({ ok: true });

    // Suppression : le compte disparaît, la contribution reste mais anonymisée.
    // Un second appareil encore connecté : sa session devra tomber après la suppression.
    const otherMemory = new Map<string, string>();
    const otherDevice = createSessionClient(config, {
      getItem: (k) => otherMemory.get(k) ?? null,
      setItem: (k, v) => void otherMemory.set(k, v),
      removeItem: (k) => void otherMemory.delete(k),
    });
    expect(await signInWithPassword(otherDevice, email, next)).toEqual({ ok: true });
    expect(await dropSessionIfAccountGone(otherDevice)).toBe(false);

    expect(await deleteAccount(user)).toEqual({ ok: true });
    expect(await dropSessionIfAccountGone(otherDevice)).toBe(true);
    expect((await otherDevice.auth.getSession()).data.session).toBeNull();
    expect((await user.auth.getSession()).data.session).toBeNull();
    expect(await signInWithPassword(user, email, next)).toMatchObject({ ok: false, reason: "invalid" });
    expect((await admin.auth.admin.getUserById(ids.user!)).data.user).toBeNull();
    const { data: left } = await admin.from("price_observations").select("submitted_by").eq("price_cents", 850).eq("product_id", ids.product);
    expect(left).toEqual([{ submitted_by: null }]);
    delete ids.user;
  }, 30_000);

  it("publie une contribution seulement après validation par un modérateur", async () => {
    const config = readSupabaseConfig(url, publicKey)!;
    const password = `Mdp-${tag}-Long!`;
    const signedIn = async (name: string) => {
      const email = `${name}-${tag}@exemple.test`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(error.message);
      createdUsers.push(data.user.id);
      const memory = new Map<string, string>();
      const client = createSessionClient(config, {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => void memory.set(k, v),
        removeItem: (k) => void memory.delete(k),
      });
      expect(await signInWithPassword(client, email, password)).toEqual({ ok: true });
      return { client, id: data.user.id };
    };
    const value = <T,>(result: { ok: true; value: T } | { ok: false; message: string }): T => {
      if (!result.ok) throw new Error(result.message);
      return result.value;
    };
    const contributor = await signedIn("contrib");
    const moderator = await signedIn("modo");
    const outsider = await signedIn("tiers");
    expect((await admin.from("moderators").insert({ user_id: moderator.id })).error).toBeNull();
    expect(await isModerator(contributor.client)).toBe(false);
    expect(await isModerator(moderator.client)).toBe(true);

    const productId = value(
      await proposeProduct(
        contributor.client,
        value(
          validateProductDraft({
            name: `Liquide vaisselle ${tag}`,
            brand: `Marque contrib ${tag}`,
            brandType: "national",
            categoryId: (await admin.from("categories").select("id").eq("slug", "liquides-vaisselle").single()).data!.id,
            barcode: "",
            amount: "0,75",
            unit: "l",
            packCount: "",
            usesCount: "",
          }),
        ),
      ),
    );
    const storeId = value(
      await proposeStore(
        contributor.client,
        value(validateStoreDraft({ retailer: `Enseigne contrib ${tag}`, name: "Centre", postalCode: "69001", city: "Lyon" })),
      ),
    );
    try {
      const found = value(await searchContributableProducts(contributor.client, `vaisselle ${tag}`));
      expect(found).toMatchObject([{ id: productId, pending: true }]);
      const price = value(
        validatePriceDraft({ price: "2,49", observedOn: toDateInput(new Date()), isPromo: false, referencePrice: "", promoLabel: "" }),
      );
      // Photo du ticket : déposée dans le dossier privé de l'auteur.
      const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).buffer;
      expect(await uploadProof(contributor.client, contributor.id, photo, "application/pdf")).toMatchObject({ ok: false });
      expect(await uploadProof(contributor.client, moderator.id, photo, "image/jpeg")).toMatchObject({ ok: false });
      const proofPath = value(await uploadProof(contributor.client, contributor.id, photo, "image/jpeg"));
      expect(proofPath.startsWith(`${contributor.id}/`)).toBe(true);
      // Privée : ni le public ni un autre compte ordinaire ne peuvent l'ouvrir.
      expect(await getProofUrl(anon, proofPath)).toBeNull();
      expect(await getProofUrl(outsider.client, proofPath)).toBeNull();
      expect(await getProofUrl(moderator.client, proofPath)).toMatch(/^http/);
      const signed = (await getProofUrl(contributor.client, proofPath))!;
      expect((await fetch(signed)).status).toBe(200);

      const observationId = value(
        await submitPrice(contributor.client, {
          userId: contributor.id,
          productId,
          storeId,
          quantity: found[0]!.quantity,
          price,
          proof: { path: proofPath, kind: "receipt" },
        }),
      );
      // Un autre compte ne peut pas s'approprier cette photo pour « prouver » son relevé.
      expect(
        await submitPrice(outsider.client, {
          userId: outsider.id,
          productId: ids.product!,
          storeId: ids.storeA!,
          quantity: found[0]!.quantity,
          price,
          proof: { path: proofPath, kind: "receipt" },
        }),
      ).toMatchObject({ ok: false });
      expect(await getProofUrl(contributor.client, proofPath)).toMatch(/^http/); // …et son échec ne l'a pas effacée

      // Avant validation : visible de l'auteur, invisible du public.
      expect(value(await listMySubmissions(contributor.client, contributor.id))).toMatchObject([
        { id: observationId, status: "pending", priceCents: 249, newProduct: true, newStore: true, method: "receipt", proofPath },
      ]);
      const catalog = createSupabaseCatalog(anon, new Date());
      expect(await catalog.getProduct(productId)).toBeNull();

      // L'auteur ne peut pas se valider ; le modérateur le peut.
      expect(await reviewSubmission(contributor.client, observationId, true)).toMatchObject({ ok: false });
      expect(value(await listPendingSubmissions(moderator.client)).map((s) => s.id)).toContain(observationId);
      expect(await reviewSubmission(moderator.client, observationId, true)).toEqual({ ok: true, value: null });

      // Après validation : produit, magasin et prix sont publics.
      const published = createSupabaseCatalog(anon, new Date());
      const product = (await published.getProduct(productId))!;
      expect(product.name).toBe(`Liquide vaisselle ${tag}`);
      const category = (await published.listCategories()).find((c) => c.id === product.categoryId)!;
      const view = buildProductView(product, category, await published.listStores(), await published.listObservations(productId), new Date());
      expect(view.best).toMatchObject({ unitPrice: { basis: "per_litre", cents: 332 } });
      expect(view.best!.store.id).toBe(storeId);
      expect(view.best!.status).toBe("confirmed"); // ticket à l'appui, validé, relevé du jour

      // Suppression du compte : la photo disparaît, le relevé reste, sans lien vers elle.
      expect(await deleteAccount(contributor.client)).toEqual({ ok: true });
      expect(await getProofUrl(moderator.client, proofPath)).toBeNull();
      const { data: kept } = await admin.from("price_observations").select("submitted_by,proof_path").eq("id", observationId);
      expect(kept).toEqual([{ submitted_by: null, proof_path: null }]);
    } finally {
      await admin.from("products").delete().eq("id", productId);
      await admin.from("stores").delete().eq("id", storeId);
      await admin.from("retailers").delete().eq("name", `Enseigne contrib ${tag}`);
      await admin.from("brands").delete().eq("name", `Marque contrib ${tag}`);
    }
  }, 30_000);

  it("garde favoris, magasins et commune privés et les relit après reconnexion", async () => {
    const config = readSupabaseConfig(url, publicKey)!;
    const password = `Mdp-${tag}-Long!`;
    const connect = async (email: string) => {
      const memory = new Map<string, string>();
      const client = createSessionClient(config, {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => void memory.set(k, v),
        removeItem: (k) => void memory.delete(k),
      });
      expect(await signInWithPassword(client, email, password)).toEqual({ ok: true });
      return client;
    };
    const make = async (name: string) => {
      const email = `${name}-${tag}@exemple.test`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(error.message);
      createdUsers.push(data.user.id);
      return { email, id: data.user.id };
    };
    const alice = await make("perso-a");
    const bob = await make("perso-b");

    const mine = createPersonalStore(await connect(alice.email), alice.id);
    await mine.reload();
    expect(mine.getState()).toMatchObject({ status: "ready", home: { postalCode: null, city: null } });
    expect(await mine.toggleFavorite(ids.product!)).toEqual({ ok: true, value: true });
    expect(await mine.toggleStore(ids.storeA!)).toEqual({ ok: true, value: true });
    expect(await mine.toggleStore(ids.storeB!)).toEqual({ ok: true, value: true });
    expect(await mine.toggleStore(ids.storeB!)).toEqual({ ok: true, value: false });
    expect(await mine.saveHome({ postalCode: "75011", city: "Paris" })).toMatchObject({ ok: true });
    expect(await mine.saveHome({ postalCode: "abc", city: "Paris" })).toMatchObject({ ok: false });

    // Nouvelle session : tout est relu depuis la base.
    const again = createPersonalStore(await connect(alice.email), alice.id);
    await again.reload();
    expect([...again.getState().favorites]).toEqual([ids.product]);
    expect([...again.getState().stores]).toEqual([ids.storeA]);
    expect(again.getState().home).toEqual({ postalCode: "75011", city: "Paris" });

    // Un autre utilisateur ne voit rien, même en demandant les lignes d'Alice.
    const bobClient = await connect(bob.email);
    const spy = createPersonalStore(bobClient, alice.id);
    await spy.reload();
    expect(spy.getState()).toMatchObject({ status: "ready", home: { postalCode: null, city: null } });
    expect(spy.getState().favorites.size + spy.getState().stores.size).toBe(0);
    // …ni écrire à sa place.
    expect(await spy.toggleFavorite(ids.product!)).toMatchObject({ ok: false });
  }, 30_000);
});

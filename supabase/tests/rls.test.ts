/**
 * Applique les migrations sur un vrai PostgreSQL embarqué (PGlite) et vérifie
 * les règles d'accès. Ne remplace pas un test sur un projet Supabase réel,
 * mais garantit que le SQL est valide et que les politiques font ce qu'elles disent.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const db = new PGlite();
const ids: Record<string, string> = {};

async function as<T>(role: "anon" | "authenticated", userId: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`);
  try {
    return await run();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, any>>(sql, params)).rows;

function observation(submittedBy: string, extra = "", cols = "") {
  return `insert into price_observations
    (product_id, store_id, observed_at, price_cents, quantity_amount, quantity_unit, source_id, method, submitted_by${cols})
    values ('${ids.product}', '${ids.store}', now(), 899, 1.5, 'l', '${ids.source}', 'community_report', '${submittedBy}'${extra})`;
}

beforeAll(async () => {
  await db.exec(readFileSync(join(root, "tests/supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(join(root, "migrations")).sort()) {
    await db.exec(readFileSync(join(root, "migrations", file), "utf8"));
  }
  for (const name of ["alice", "bob"]) {
    ids[name] = (await rows("insert into auth.users default values returning id"))[0]!.id;
  }
  ids.category = (await rows("select id from categories where slug = 'lessives'"))[0]!.id;
  ids.product = (await rows("insert into products (name, category_id, quantity_amount, quantity_unit, uses_count) values ('Lessive test', $1, 1.5, 'l', 30) returning id", [ids.category]))[0]!.id;
  ids.store = (await rows("insert into stores (name, postal_code, city) values ('Magasin test', '75001', 'Paris') returning id"))[0]!.id;
  ids.source = (await rows("insert into data_sources (slug, name) values ('test', 'Test') returning id"))[0]!.id;
});

describe("comptes", () => {
  it("crée un profil à l'inscription, visible de son seul propriétaire", async () => {
    expect(await rows("select id from profiles")).toHaveLength(2);
    const seen = await as("authenticated", ids.alice!, () => rows("select id from profiles"));
    expect(seen.map((r) => r.id)).toEqual([ids.alice]);
    expect(await as("anon", null, () => rows("select id from profiles").catch(() => []))).toEqual([]);
  });

  it("interdit de modifier le profil d'un autre", async () => {
    await as("authenticated", ids.alice!, () => db.exec(`update profiles set city = 'Lyon' where id = '${ids.bob}'`));
    expect((await rows("select city from profiles where id = $1", [ids.bob]))[0]!.city).toBeNull();
  });
});

describe("catalogue", () => {
  it("est lisible sans compte mais pas modifiable", async () => {
    expect(await as("anon", null, () => rows("select slug from categories"))).toHaveLength(9);
    await expect(
      as("anon", null, () => db.exec("insert into categories (slug, name, comparison_basis) values ('x', 'X', 'per_unit')")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("authenticated", ids.alice!, () => db.exec("update products set name = 'piraté'")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("observations de prix", () => {
  it("accepte un envoi en attente, invisible du public tant qu'il n'est pas validé", async () => {
    await as("authenticated", ids.alice!, () => db.exec(observation(ids.alice!)));
    expect(await as("anon", null, () => rows("select id from price_observations"))).toHaveLength(0);
    expect(await as("authenticated", ids.bob!, () => rows("select id from price_observations"))).toHaveLength(0);
    expect(await as("authenticated", ids.alice!, () => rows("select id from price_observations"))).toHaveLength(1);

    await db.exec("update price_observations set review_status = 'accepted'");
    expect(await as("anon", null, () => rows("select id from price_observations"))).toHaveLength(1);
  });

  it("refuse un envoi auto-validé, usurpé, ou présenté comme estimation serveur", async () => {
    const denied = /row-level security/;
    await expect(
      as("authenticated", ids.alice!, () => db.exec(observation(ids.alice!, ", 'accepted'", ", review_status"))),
    ).rejects.toThrow(denied);
    await expect(as("authenticated", ids.alice!, () => db.exec(observation(ids.bob!)))).rejects.toThrow(denied);
    await expect(
      as("authenticated", ids.alice!, () => db.exec(observation(ids.alice!, ", 5", ", confirmations"))),
    ).rejects.toThrow(denied);
    await expect(
      as("authenticated", ids.alice!, () => db.exec(observation(ids.alice!).replace("'community_report'", "'model_estimate'"))),
    ).rejects.toThrow(denied);
    await expect(as("anon", null, () => db.exec(observation(ids.alice!)))).rejects.toThrow(/permission denied/);
  });

  it("empêche un utilisateur de modifier ou supprimer une observation", async () => {
    await expect(
      as("authenticated", ids.alice!, () => db.exec("update price_observations set price_cents = 1")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("authenticated", ids.alice!, () => db.exec("delete from price_observations")),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejette les valeurs aberrantes", async () => {
    await expect(db.exec(observation(ids.alice!).replace("899", "0"))).rejects.toThrow(/check constraint/);
    await expect(db.exec(observation(ids.alice!).replace("now()", "now() + interval '3 days'"))).rejects.toThrow(/check constraint/);
  });
});

describe("données privées", () => {
  it("cloisonne les favoris", async () => {
    await as("authenticated", ids.alice!, () =>
      db.exec(`insert into favorites (user_id, product_id) values ('${ids.alice}', '${ids.product}')`),
    );
    expect(await as("authenticated", ids.bob!, () => rows("select * from favorites"))).toHaveLength(0);
    await expect(
      as("authenticated", ids.bob!, () =>
        db.exec(`insert into favorites (user_id, product_id) values ('${ids.alice}', '${ids.product}')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("réserve un foyer à ses membres, son créateur en étant administrateur", async () => {
    const [household] = await as("authenticated", ids.alice!, () =>
      rows(`insert into households (name, created_by) values ('Maison', '${ids.alice}') returning id`),
    );
    const members = await as("authenticated", ids.alice!, () => rows("select user_id, role from household_members"));
    expect(members).toEqual([{ user_id: ids.alice, role: "admin" }]);
    expect(await as("authenticated", ids.bob!, () => rows("select id from households"))).toHaveLength(0);
    await expect(
      as("authenticated", ids.bob!, () =>
        db.exec(`insert into household_members (household_id, user_id) values ('${household!.id}', '${ids.bob}')`),
      ),
    ).rejects.toThrow(/row-level security/);

    await as("authenticated", ids.alice!, () =>
      db.exec(`insert into household_members (household_id, user_id, role) values ('${household!.id}', '${ids.bob}', 'guest')`),
    );
    expect(await as("authenticated", ids.bob!, () => rows("select id from households"))).toHaveLength(1);
  });

  it("supprime les données personnelles avec le compte", async () => {
    await db.exec(`delete from auth.users where id = '${ids.alice}'`);
    expect(await rows("select * from favorites")).toHaveLength(0);
    expect(await rows("select * from households")).toHaveLength(0);
    // Le prix constaté reste, anonymisé.
    expect((await rows("select submitted_by from price_observations"))[0]!.submitted_by).toBeNull();
  });
});

describe("contributions", () => {
  const propose = (barcode: string | null) =>
    `select propose_product('Liquide vaisselle test', 'Marque Test', 'national', '${ids.category}', ${barcode ? `'${barcode}'` : "null"}, 0.75, 'l', 1, null) as id`;

  it("refuse toute proposition sans compte", async () => {
    await expect(as("anon", null, () => rows(propose(null)))).rejects.toThrow(/permission denied/);
    await expect(
      as("anon", null, () => rows("select propose_store('Enseigne', 'Magasin', '69001', 'Lyon')")),
    ).rejects.toThrow(/permission denied/);
  });

  it("garde un produit et un magasin proposés invisibles du public jusqu'à validation", async () => {
    const carol = (await rows("insert into auth.users default values returning id"))[0]!.id as string;
    const dave = (await rows("insert into auth.users default values returning id"))[0]!.id as string;
    const mod = (await rows("insert into auth.users default values returning id"))[0]!.id as string;
    await db.exec(`insert into moderators (user_id) values ('${mod}')`);

    const product = (await as("authenticated", carol, () => rows(propose("3017620422003"))))[0]!.id as string;
    const store = (await as("authenticated", carol, () =>
      rows("select propose_store('Enseigne Test', 'Magasin proposé', '69001', 'Lyon') as id")))[0]!.id as string;

    // Même code-barres, même magasin : aucun doublon, même pour un autre utilisateur.
    expect((await as("authenticated", dave, () => rows(propose("3017620422003"))))[0]!.id).toBe(product);
    expect((await as("authenticated", dave, () =>
      rows("select propose_store('enseigne test', 'MAGASIN PROPOSÉ', '69001', 'Lyon') as id")))[0]!.id).toBe(store);

    const visible = (who: "anon" | "authenticated", id: string | null) =>
      as(who, id, async () => ({
        product: (await rows("select 1 from products where id = $1", [product])).length,
        store: (await rows("select 1 from stores where id = $1", [store])).length,
      }));
    expect(await visible("anon", null)).toEqual({ product: 0, store: 0 });
    expect(await visible("authenticated", dave)).toEqual({ product: 0, store: 0 });
    expect(await visible("authenticated", carol)).toEqual({ product: 1, store: 1 });
    expect(await visible("authenticated", mod)).toEqual({ product: 1, store: 1 });

    const obs = (await as("authenticated", carol, () => rows(`insert into price_observations
      (product_id, store_id, observed_at, price_cents, quantity_amount, quantity_unit, source_id, method, submitted_by)
      values ('${product}', '${store}', now(), 249, 0.75, 'l', '${ids.source}', 'community_report', '${carol}') returning id`)))[0]!.id as string;

    // Seul un modérateur valide ; l'auteur ne peut pas se valider lui-même.
    await expect(
      as("authenticated", carol, () => db.exec(`select review_observation('${obs}', true)`)),
    ).rejects.toThrow(/modérateurs/);
    expect(await as("authenticated", mod, () => rows("select id from price_observations where id = $1", [obs]))).toHaveLength(1);
    await as("authenticated", mod, () => db.exec(`select review_observation('${obs}', true)`));

    expect(await visible("anon", null)).toEqual({ product: 1, store: 1 });
    const published = await as("anon", null, () => rows("select review_status from price_observations where id = $1", [obs]));
    expect(published).toEqual([{ review_status: "accepted" }]);
    await expect(
      as("authenticated", mod, () => db.exec(`select review_observation('${obs}', false)`)),
    ).rejects.toThrow(/déjà traité/);
  });

  it("ne publie ni le produit ni le magasin d'un relevé refusé", async () => {
    const erin = (await rows("insert into auth.users default values returning id"))[0]!.id as string;
    const mod = (await rows("select user_id from moderators"))[0]!.user_id as string;
    const product = (await as("authenticated", erin, () => rows(propose(null))))[0]!.id as string;
    const obs = (await as("authenticated", erin, () => rows(`insert into price_observations
      (product_id, store_id, observed_at, price_cents, quantity_amount, quantity_unit, source_id, method, submitted_by)
      values ('${product}', '${ids.store}', now(), 1, 0.75, 'l', '${ids.source}', 'community_report', '${erin}') returning id`)))[0]!.id as string;
    await as("authenticated", mod, () => db.exec(`select review_observation('${obs}', false)`));
    expect(await as("anon", null, () => rows("select 1 from products where id = $1", [product]))).toEqual([]);
    expect(await as("anon", null, () => rows("select 1 from price_observations where id = $1", [obs]))).toEqual([]);
  });

  it("interdit de se nommer modérateur", async () => {
    await expect(
      as("authenticated", ids.bob!, () => db.exec(`insert into moderators (user_id) values ('${ids.bob}')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("preuves photo", () => {
  const withProof = (user: string, method: string, path: string | null) =>
    `insert into price_observations
      (product_id, store_id, observed_at, price_cents, quantity_amount, quantity_unit, source_id, method, submitted_by, proof_path)
      values ('${ids.product}', '${ids.store}', now(), 899, 1.5, 'l', '${ids.source}', '${method}', '${user}', ${path ? `'${path}'` : "null"})`;

  it("refuse de se dire « ticket » ou « étiquette » sans preuve dans son propre dossier", async () => {
    const bob = ids.bob!;
    await expect(as("authenticated", bob, () => db.exec(withProof(bob, "receipt", null)))).rejects.toThrow(/row-level security/);
    await expect(
      as("authenticated", bob, () => db.exec(withProof(bob, "shelf_label", "00000000-0000-0000-0000-000000000000/x.jpg"))),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as("authenticated", bob, () => db.exec(withProof(bob, "community_report", `${bob}/x.jpg`))),
    ).rejects.toThrow(/row-level security/);
    await as("authenticated", bob, () => db.exec(withProof(bob, "receipt", `${bob}/ticket.jpg`)));
  });

  it("garde les fichiers privés : auteur et modérateurs seulement", async () => {
    const bob = ids.bob!;
    const other = (await rows("insert into auth.users default values returning id"))[0]!.id as string;
    const mod = (await rows("select user_id from moderators"))[0]!.user_id as string;
    const put = (user: string, folder: string) =>
      as("authenticated", user, () => db.exec(`insert into storage.objects (bucket_id, name) values ('proofs', '${folder}/ticket.jpg')`));
    await put(bob, bob);
    await expect(put(other, bob)).rejects.toThrow(/row-level security/);
    const seen = (user: string) => as("authenticated", user, () => rows("select name from storage.objects"));
    expect(await seen(bob)).toHaveLength(1);
    expect(await seen(other)).toHaveLength(0);
    expect(await seen(mod)).toHaveLength(1);
    await as("authenticated", other, () => db.exec("delete from storage.objects"));
    expect(await rows("select 1 from storage.objects")).toHaveLength(1);
    await as("authenticated", bob, () => db.exec("delete from storage.objects"));
    expect(await rows("select 1 from storage.objects")).toHaveLength(0);
  });
});

// En dernier : ce bloc supprime un compte utilisé par les tests précédents.
describe("suppression de compte", () => {
  it("est refusée sans session", async () => {
    await expect(as("anon", null, () => db.exec("select delete_my_account()"))).rejects.toThrow(/permission denied/);
  });

  it("supprime le compte de l'appelant, pas celui des autres, et anonymise ses relevés", async () => {
    const carol = (await rows("insert into auth.users default values returning id"))[0]!.id as string;
    await as("authenticated", ids.bob!, () => db.exec(observation(ids.bob!)));
    await as("authenticated", ids.bob!, () => db.exec("select delete_my_account()"));
    const users = (await rows("select id from auth.users")).map((r) => r.id);
    expect(users).toContain(carol);
    expect(users).not.toContain(ids.bob);
    expect(await rows("select 1 from profiles where id = $1", [ids.bob])).toEqual([]);
    const orphans = await rows("select count(*)::int as n from price_observations where submitted_by is null");
    expect(await rows("select 1 from price_observations where submitted_by is null and proof_path is not null")).toEqual([]);
    expect(orphans[0]!.n).toBeGreaterThan(0);
  });
});

import {
  buildProductView,
  type CatalogRepository,
  type Category,
  type ProductView,
} from '@lvp/core';
import { createPublicClient, createSupabaseCatalog, readSupabaseConfig } from '@lvp/data-supabase';
import { createDemoCatalog } from '@lvp/demo-data';
import { useEffect, useState } from 'react';

/**
 * Point d'entrée unique vers les données. Si EXPO_PUBLIC_SUPABASE_URL et
 * EXPO_PUBLIC_SUPABASE_KEY sont définies, l'application lit la base réelle ;
 * sinon elle sert le jeu fictif. Les deux ne sont jamais mélangés.
 */
let now = new Date();
const config = readSupabaseConfig(
  process.env.EXPO_PUBLIC_SUPABASE_LAN_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_KEY,
);
const publicClient = config ? createPublicClient(config) : null;
const makeRepository = (): CatalogRepository =>
  publicClient ? createSupabaseCatalog(publicClient, now) : createDemoCatalog(now);
let repository = makeRepository();

export interface CatalogSnapshot {
  asOf: Date;
  dataset: CatalogRepository['dataset'];
  categories: Category[];
  views: ProductView[];
}

let snapshot: Promise<CatalogSnapshot> | null = null;

function loadSnapshot(): Promise<CatalogSnapshot> {
  snapshot ??= (async () => {
    const [categories, stores, products] = await Promise.all([
      repository.listCategories(),
      repository.listStores(),
      repository.searchProducts({}),
    ]);
    const byId = new Map(categories.map((c) => [c.id, c]));
    const views = await Promise.all(
      products.map(async (p) =>
        buildProductView(p, byId.get(p.categoryId)!, stores, await repository.listObservations(p.id), now),
      ),
    );
    return { asOf: now, dataset: repository.dataset, categories, views };
  })();
  // Un échec ne doit pas rester en cache : la prochaine tentative repart de zéro.
  snapshot.catch(() => (snapshot = null));
  return snapshot;
}

const listeners = new Set<() => void>();

/** Fait relire le catalogue par tous les écrans (après la publication d'un relevé). */
export function refreshCatalog(): void {
  now = new Date();
  repository = makeRepository();
  snapshot = null;
  listeners.forEach((listener) => listener());
}

export type Loadable<T> =
  | { state: 'loading' }
  | { state: 'error'; retry: () => void }
  | { state: 'ready'; data: T };

export function useCatalog(): Loadable<CatalogSnapshot> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Loadable<CatalogSnapshot>>({ state: 'loading' });
  useEffect(() => {
    const reload = () => setAttempt((n) => n + 1);
    listeners.add(reload);
    return () => void listeners.delete(reload);
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadSnapshot().then(
      (data) => !cancelled && setResult({ state: 'ready', data }),
      () =>
        !cancelled &&
        setResult({
          state: 'error',
          retry: () => {
            setResult({ state: 'loading' });
            setAttempt((n) => n + 1);
          },
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return result;
}

export async function searchProductIds(text: string, categoryId?: string): Promise<Set<string>> {
  const found = await repository.searchProducts({ text, categoryId });
  return new Set(found.map((p) => p.id));
}

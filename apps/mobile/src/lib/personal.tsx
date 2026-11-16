import { createPersonalStore, emptyPersonalState, type PersonalState, type PersonalStore } from '@lvp/data-supabase';
import { createContext, use, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import { useAccount } from './account';

const PersonalContext = createContext<PersonalStore | null>(null);
const noop = () => () => {};
const emptyState = () => emptyPersonalState;

/** Favoris, magasins habituels et commune du compte connecté (absent si déconnecté). */
export function PersonalProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const client = account.status === 'signedIn' ? account.client : null;
  const userId = account.status === 'signedIn' ? account.userId : null;
  const store = useMemo(() => (client && userId ? createPersonalStore(client, userId) : null), [client, userId]);
  useEffect(() => {
    void store?.reload();
  }, [store]);
  return <PersonalContext value={store}>{children}</PersonalContext>;
}

/** `null` quand personne n'est connecté. */
export function usePersonal(): { store: PersonalStore; state: PersonalState } | null {
  const store = use(PersonalContext);
  const state = useSyncExternalStore(store?.subscribe ?? noop, store?.getState ?? emptyState, emptyState);
  return store ? { store, state } : null;
}

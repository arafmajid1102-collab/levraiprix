import { createSessionClient, dropSessionIfAccountGone, isModerator, readSupabaseConfig, type SessionStorage } from '@lvp/data-supabase';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

type Client = ReturnType<typeof createSessionClient>;

/**
 * État du compte sur l'appareil.
 * - « unavailable » : aucune base n'est configurée (mode démonstration).
 * - « loading » : la session enregistrée est en cours de lecture.
 */
export type Account =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'signedOut'; client: Client }
  | { status: 'signedIn'; client: Client; email: string; userId: string; moderator: boolean };

// Le trousseau du téléphone limite la taille d'une valeur : la session est découpée.
const CHUNK = 1800;

/** Session conservée dans le trousseau chiffré du téléphone (Keychain / Keystore). */
const secureStorage: SessionStorage = {
  async getItem(key) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.every((part) => part != null) ? parts.join('') : null;
  },
  async setItem(key, value) {
    const previous = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(`${key}.n`, String(count));
    for (let i = count; i < previous; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
  async removeItem(key) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

// Seules l'URL et la clé PUBLIQUE arrivent ici ; readSupabaseConfig refuse une clé secrète.
const config = readSupabaseConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY);

let sharedClient: Client | null = null;
// Sur le web (aperçu Expo), le trousseau n'existe pas : supabase-js utilise localStorage.
const getClient = () =>
  (sharedClient ??= createSessionClient(config!, Platform.OS === 'web' ? undefined : secureStorage));

const AccountContext = createContext<Account>({ status: 'unavailable' });

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account>(config ? { status: 'loading' } : { status: 'unavailable' });

  useEffect(() => {
    if (!config) return;
    const client = getClient();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setAccount((current) => {
        if (!session) return { status: 'signedOut', client };
        // Un simple renouvellement de session ne doit pas faire perdre le rôle déjà lu.
        const moderator = current.status === 'signedIn' && current.userId === session.user.id && current.moderator;
        return { status: 'signedIn', client, email: session.user.email ?? '', userId: session.user.id, moderator };
      });
    });
    // Le renouvellement de session ne tourne que lorsque l'application est au premier plan.
    const appState =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') client.auth.startAutoRefresh();
            else client.auth.stopAutoRefresh();
          });
    return () => {
      data.subscription.unsubscribe();
      appState?.remove();
    };
  }, []);

  // Le rôle est lu à part : aucun appel réseau n'est permis dans le rappel ci-dessus.
  const userId = account.status === 'signedIn' ? account.userId : null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Le compte a pu être supprimé depuis un autre appareil : la session locale ne vaut alors plus rien.
    void dropSessionIfAccountGone(getClient());
    isModerator(getClient()).then((moderator) => {
      if (cancelled || !moderator) return;
      setAccount((current) =>
        current.status === 'signedIn' && current.userId === userId ? { ...current, moderator: true } : current,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <AccountContext value={account}>{children}</AccountContext>;
}

export const useAccount = () => use(AccountContext);

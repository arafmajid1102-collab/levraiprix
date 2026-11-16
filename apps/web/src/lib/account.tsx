"use client";

import { createSessionClient, dropSessionIfAccountGone, isModerator, readSupabaseConfig } from "@lvp/data-supabase";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

type Client = ReturnType<typeof createSessionClient>;

/**
 * État du compte dans le navigateur.
 * - « unavailable » : aucune base n'est configurée (mode démonstration).
 * - « loading » : la session enregistrée sur l'appareil est en cours de lecture.
 */
export type Account =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "signedOut"; client: Client }
  | { status: "signedIn"; client: Client; email: string; userId: string; moderator: boolean };

// Seules l'URL et la clé PUBLIQUE arrivent ici ; readSupabaseConfig refuse une clé secrète.
const config = readSupabaseConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_KEY);

let browserClient: Client | null = null;
const getClient = () => (browserClient ??= createSessionClient(config!));

const AccountContext = createContext<Account>({ status: "unavailable" });

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account>(config ? { status: "loading" } : { status: "unavailable" });

  useEffect(() => {
    if (!config) return;
    const client = getClient();
    // Émet d'abord la session déjà enregistrée, puis chaque connexion / déconnexion.
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setAccount((current) => {
        if (!session) return { status: "signedOut", client };
        // Un simple renouvellement de session ne doit pas faire perdre le rôle déjà lu.
        const moderator = current.status === "signedIn" && current.userId === session.user.id && current.moderator;
        return { status: "signedIn", client, email: session.user.email ?? "", userId: session.user.id, moderator };
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Le rôle est lu à part : aucun appel réseau n'est permis dans le rappel ci-dessus.
  const userId = account.status === "signedIn" ? account.userId : null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Le compte a pu être supprimé depuis un autre appareil : la session locale ne vaut alors plus rien.
    void dropSessionIfAccountGone(getClient());
    isModerator(getClient()).then((moderator) => {
      if (cancelled || !moderator) return;
      setAccount((current) =>
        current.status === "signedIn" && current.userId === userId ? { ...current, moderator: true } : current,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <AccountContext value={account}>{children}</AccountContext>;
}

export const useAccount = () => use(AccountContext);

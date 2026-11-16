import {
  formatPrice,
  formatUnitPrice,
  matchesQuery,
  proximityLabel,
  sortStoresByProximity,
  storeProximity,
  type Offer,
  type Proximity,
} from '@lvp/core';
import { listContributableStores, type ContributableStore } from '@lvp/data-supabase';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAccount } from '@/lib/account';
import { usePersonal } from '@/lib/personal';

import { ActionButton, Field, Notice, type NoticeValue } from './form';
import { Card, Loading, Text } from './primitives';
import { radius, space, useTheme } from './theme';

/** Bouton « favori » de la fiche produit. */
export function FavoriteButton({ productId }: { productId: string }) {
  const personal = usePersonal();
  const router = useRouter();
  const [error, setError] = useState<NoticeValue>(null);
  if (!personal) {
    return <ActionButton kind="secondary" label="Se connecter pour suivre ce produit" onPress={() => router.push('/connexion')} />;
  }
  const { store, state } = personal;
  const on = state.favorites.has(productId);
  return (
    <>
      <ActionButton
        kind={on ? 'primary' : 'secondary'}
        label={on ? '★ Dans vos favoris' : '☆ Ajouter aux favoris'}
        disabled={state.status !== 'ready'}
        onPress={async () => {
          const result = await store.toggleFavorite(productId);
          setError(result.ok ? null : { tone: 'error', text: result.message });
        }}
      />
      <Notice notice={error} />
    </>
  );
}

const storeName = (s: { retailerName: string; name: string }) =>
  `${s.retailerName === 'Indépendant' ? '' : `${s.retailerName} — `}${s.name}`;

/** Sur la fiche produit : le meilleur prix parmi les magasins habituels. `ranked` est déjà trié. */
export function MyStoresOffer({ ranked }: { ranked: Offer[] }) {
  const personal = usePersonal();
  const { color } = useTheme();
  if (!personal || personal.state.status !== 'ready') return null;
  const { stores } = personal.state;
  const offers = ranked.filter((o) => o.unitPrice);
  const best = offers.find((o) => stores.has(o.store.id));
  const box = { padding: space.md, borderRadius: radius.md, borderWidth: 1 } as const;
  if (!best) {
    return (
      <View style={[box, { borderStyle: 'dashed', borderColor: color.borderStrong }]}>
        <Text variant="small" tone="textMuted">
          {stores.size === 0
            ? 'Choisissez vos magasins habituels dans l’onglet Profil pour voir ici le meilleur prix près de chez vous.'
            : 'Aucun de vos magasins habituels n’a de prix récent pour ce produit.'}
        </Text>
      </View>
    );
  }
  const rank = offers.indexOf(best) + 1;
  return (
    <View style={[box, { borderColor: color.accent, backgroundColor: color.accentSoft }]}>
      <Text variant="small">
        <Text variant="small" style={{ fontWeight: '700' }}>
          Dans vos magasins :
        </Text>{' '}
        {formatUnitPrice(best.unitPrice!)} ({formatPrice(best.observation.priceCents)}) chez {storeName(best.store)}.{' '}
        {rank === 1 ? 'C’est le meilleur prix constaté.' : `${rank}ᵉ prix sur ${offers.length} magasins comparés.`}
      </Text>
    </View>
  );
}

const groups: Proximity[] = ['same_postal_code', 'same_department', 'elsewhere'];

/** Bloc du profil : commune de l'utilisateur et magasins où il fait ses courses. */
export function MyStoresCard() {
  const account = useAccount();
  const personal = usePersonal();
  const { color } = useTheme();
  const [stores, setStores] = useState<ContributableStore[] | null>(null);
  const [postalCode, setPostalCode] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeValue>(null);

  const client = account.status === 'signedIn' ? account.client : null;
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    listContributableStores(client).then((result) => {
      if (cancelled) return;
      if (result.ok) setStores(result.value);
      else setNotice({ tone: 'error', text: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!personal) return null;
  const { store, state } = personal;
  const home = state.home;
  // Tant que l'utilisateur n'a rien tapé, les champs montrent la valeur enregistrée.
  const postalValue = postalCode ?? home.postalCode ?? '';
  const cityValue = city ?? home.city ?? '';

  async function saveHome() {
    setBusy(true);
    const result = await store.saveHome({ postalCode: postalValue, city: cityValue });
    setBusy(false);
    setNotice(
      result.ok
        ? { tone: 'good', text: result.value.postalCode ? 'Commune enregistrée.' : 'Commune effacée.' }
        : { tone: 'error', text: result.message },
    );
  }

  const visible = stores
    ? sortStoresByProximity(
        stores.filter((s) => !filter.trim() || matchesQuery(`${s.retailerName} ${s.name} ${s.city} ${s.postalCode}`, filter)),
        home.postalCode,
      )
    : [];

  return (
    <Card>
      <Text variant="title">Mes magasins</Text>
      <Text variant="small" tone="textMuted">
        Indiquez votre commune et cochez les magasins où vous faites vos courses : chaque fiche produit vous montrera le
        meilleur prix parmi eux. Ces informations restent privées.
      </Text>
      <Field label="Code postal" value={postalValue} onChangeText={setPostalCode} keyboardType="number-pad" maxLength={5} autoComplete="postal-code" />
      <Field label="Ville" value={cityValue} onChangeText={setCity} maxLength={80} autoCapitalize="words" />
      <ActionButton kind="secondary" label="Enregistrer" disabled={busy || state.status !== 'ready'} onPress={saveHome} />
      <Notice notice={notice} />

      {stores === null || state.status === 'loading' ? (
        <Loading />
      ) : stores.length === 0 ? (
        <Text variant="small" tone="textMuted">
          Aucun magasin n’est encore enregistré. Ils apparaissent ici dès qu’un prix y a été relevé.
        </Text>
      ) : (
        <>
          {stores.length > 8 ? (
            <Field label="Filtrer les magasins" placeholder="Enseigne, ville ou code postal" value={filter} onChangeText={setFilter} />
          ) : null}
          {visible.length === 0 ? (
            <Text variant="small" tone="textMuted">
              Aucun magasin ne correspond.
            </Text>
          ) : null}
          {groups.map((group) => {
            const inGroup = visible.filter((s) => storeProximity(s, home.postalCode) === group);
            if (inGroup.length === 0) return null;
            return (
              <View key={group} style={{ gap: space.sm }}>
                {home.postalCode ? (
                  <Text variant="eyebrow" tone="textSubtle">
                    {proximityLabel[group]}
                  </Text>
                ) : null}
                {inGroup.map((s) => {
                  const checked = state.stores.has(s.id);
                  return (
                    <Pressable
                      key={s.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${storeName(s)}, ${s.postalCode} ${s.city}`}
                      onPress={async () => {
                        const result = await store.toggleStore(s.id);
                        setNotice(result.ok ? null : { tone: 'error', text: result.message });
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        borderWidth: 1,
                        borderRadius: radius.md,
                        borderColor: checked ? color.accent : color.border,
                        backgroundColor: checked ? color.accentSoft : 'transparent',
                      }}>
                      <Text tone={checked ? 'accentText' : 'textSubtle'} style={{ fontWeight: '700' }}>
                        {checked ? '☑' : '☐'}
                      </Text>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="small" style={{ fontWeight: '600' }}>
                          {storeName(s)}
                        </Text>
                        <Text variant="small" tone="textSubtle">
                          {s.postalCode} {s.city}
                          {s.pending ? ' · en attente de validation' : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </>
      )}
    </Card>
  );
}

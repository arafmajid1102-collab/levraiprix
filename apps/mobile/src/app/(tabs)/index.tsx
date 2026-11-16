import { brand } from '@lvp/design-system';
import { formatPrice, formatUnitPrice, type Offer, type ProductView } from '@lvp/core';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useCatalog } from '@/lib/catalog';
import { usePersonal } from '@/lib/personal';
import { Card, DemoNotice, Screen, Text, VerdictBadge } from '@/ui/primitives';
import { ProductCard } from '@/ui/product-card';
import { CatalogGate } from '@/ui/states';
import { space } from '@/ui/theme';

function Signal({ offer }: { offer: Offer }) {
  const finding = offer.assessment.findings.find((f) => f.tone === 'danger') ?? offer.assessment.findings[0];
  return (
    <Link href={{ pathname: '/produit/[id]', params: { id: offer.product.id } }} asChild>
      <Pressable accessibilityRole="link" style={({ pressed }) => pressed && { opacity: 0.75 }}>
        <Card>
          <VerdictBadge verdict={offer.assessment.verdict} />
          <View style={{ gap: space.xxs }}>
            <Text variant="title">{offer.product.name}</Text>
            <Text variant="small" tone="textSubtle">
              {offer.store.name} · {formatPrice(offer.observation.priceCents)}
              {offer.unitPrice ? ` · ${formatUnitPrice(offer.unitPrice)}` : ''}
            </Text>
          </View>
          {finding ? (
            <Text variant="small" tone="textMuted">
              {finding.message}
            </Text>
          ) : null}
        </Card>
      </Pressable>
    </Link>
  );
}

/** Produits suivis par l'utilisateur connecté ; rien tant qu'il n'y en a pas. */
function Favorites({ views, asOf }: { views: ProductView[]; asOf: Date }) {
  const personal = usePersonal();
  if (!personal || personal.state.status !== 'ready') return null;
  const mine = views.filter((v) => personal.state.favorites.has(v.product.id));
  if (mine.length === 0) return null;
  return (
    <View style={{ gap: space.md }}>
      <Text variant="heading">Vos favoris</Text>
      {mine.map((v) => (
        <ProductCard key={v.product.id} view={v} asOf={asOf} />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const catalog = useCatalog();
  return (
    <Screen>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Text variant="eyebrow" tone="textSubtle">
          {brand.wordmark.lead}
          <Text variant="eyebrow" tone="accentText">
            {brand.wordmark.accent}
          </Text>
        </Text>
        <Text variant="display">
          Le prix affiché n’est pas <Text variant="display" tone="accentText">le vrai prix</Text>.
        </Text>
        <Text tone="textMuted">{brand.tagline}</Text>
      </View>

      <CatalogGate catalog={catalog}>
        {({ views, dataset, asOf }) => {
          const offers = views.flatMap((v) => [...v.ranked, ...v.unranked]).filter((o) => o.status !== 'historical');
          const misleading = offers.filter((o) => o.assessment.verdict === 'misleading');
          const good = offers.filter((o) => o.assessment.verdict === 'good_deal');
          return (
            <>
              {dataset.kind === 'demo' ? <DemoNotice label={dataset.label} /> : null}
              <Favorites views={views} asOf={asOf} />
              {misleading.length > 0 ? (
                <View style={{ gap: space.md }}>
                  <Text variant="heading">Offres qui ne tiennent pas</Text>
                  {misleading.map((o) => (
                    <Signal key={o.observation.id} offer={o} />
                  ))}
                </View>
              ) : null}
              {good.length > 0 ? (
                <View style={{ gap: space.md }}>
                  <Text variant="heading">Vraies bonnes affaires</Text>
                  {good.map((o) => (
                    <Signal key={o.observation.id} offer={o} />
                  ))}
                </View>
              ) : null}
              <View style={{ gap: space.md }}>
                <Text variant="heading">Comparés dans plusieurs magasins</Text>
                {views
                  .filter((v) => v.ranked.length >= 2)
                  .slice(0, 4)
                  .map((v) => (
                    <ProductCard key={v.product.id} view={v} asOf={asOf} />
                  ))}
              </View>
            </>
          );
        }}
      </CatalogGate>
    </Screen>
  );
}

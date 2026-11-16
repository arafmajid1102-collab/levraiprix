import {
  basisLabel,
  formatDate,
  formatPercent,
  formatPrice,
  formatRelativeDay,
  formatUnitPrice,
  methodLabel,
  type Offer,
} from '@lvp/core';
import type { ThemeColors } from '@lvp/design-system';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { useCatalog } from '@/lib/catalog';
import { Card, ConfidenceText, EmptyState, StatusBadge, Text, VerdictBadge } from '@/ui/primitives';
import { FavoriteButton, MyStoresOffer } from '@/ui/personal';
import { ProductCard } from '@/ui/product-card';
import { CatalogGate } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';

const findingColors = (color: ThemeColors, tone: string) =>
  tone === 'good'
    ? [color.good, color.goodSoft]
    : tone === 'danger'
      ? [color.danger, color.dangerSoft]
      : tone === 'warn'
        ? [color.warn, color.warnSoft]
        : [color.borderStrong, color.bgSunken];

function OfferCard({ offer, rank, best, asOf }: { offer: Offer; rank?: number; best?: Offer | null; asOf: Date }) {
  const { color } = useTheme();
  const { observation, assessment } = offer;
  const gap =
    best && best !== offer && offer.unitPrice && best.unitPrice
      ? offer.unitPrice.cents / best.unitPrice.cents - 1
      : null;
  return (
    <Card style={rank === 1 ? { borderColor: color.good } : undefined}>
      <View style={{ gap: space.xxs }}>
        <Text variant="title">
          {rank ? `${rank}. ` : ''}
          {offer.store.name}
        </Text>
        <Text variant="small" tone="textSubtle">
          {methodLabel[observation.method]} · {formatRelativeDay(observation.observedAt, asOf)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm }}>
        <Text variant="price">{offer.unitPrice ? formatUnitPrice(offer.unitPrice) : 'Prix unitaire incalculable'}</Text>
        <Text variant="small" tone="textMuted" style={{ fontVariant: ['tabular-nums'] }}>
          {formatPrice(observation.priceCents)}
          {observation.promo?.claimedReferencePriceCents
            ? `  (barré : ${formatPrice(observation.promo.claimedReferencePriceCents)})`
            : ''}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
        <StatusBadge status={offer.status} />
        {observation.promo || assessment.verdict === 'misleading' ? <VerdictBadge verdict={assessment.verdict} /> : null}
        <ConfidenceText confidence={offer.confidence} />
      </View>
      {gap !== null && gap > 0.005 ? (
        <Text variant="small" tone="textSubtle">
          {formatPercent(gap)} par rapport au moins cher
        </Text>
      ) : null}
      {assessment.findings.map((f) => {
        const [fg, bg] = findingColors(color, f.tone);
        return (
          <View
            key={f.code}
            style={{ backgroundColor: bg, borderLeftColor: fg, borderLeftWidth: 3, borderRadius: radius.sm, padding: space.md }}>
            <Text variant="small">{f.message}</Text>
          </View>
        );
      })}
      {assessment.evidence.usualUnitPrice ? (
        <Text variant="small" tone="textSubtle">
          Prix habituel ici : {formatUnitPrice(assessment.evidence.usualUnitPrice)}, d’après{' '}
          {assessment.evidence.sampleSize} relevés sur {assessment.evidence.spanDays} jours.
        </Text>
      ) : null}
      {offer.status === 'estimated' ? (
        <Text variant="small" tone="info">
          Ce montant est une estimation calculée : personne ne l’a constaté en magasin.
        </Text>
      ) : null}
    </Card>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { color } = useTheme();
  const catalog = useCatalog();
  return (
    <ScrollView
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.huge, gap: space.xl, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      <CatalogGate catalog={catalog}>
        {({ views, asOf }) => {
          const view = views.find((v) => v.product.id === id);
          if (!view) {
            return (
              <EmptyState title="Produit introuvable">
                <Text variant="small" tone="textMuted">
                  Ce produit n’existe pas ou a été retiré du catalogue.
                </Text>
              </EmptyState>
            );
          }
          const { product, category, best, ranked, unranked, history } = view;
          const basis = best?.unitPrice?.basis ?? category.comparisonBasis;
          const alternatives = views
            .filter(
              (v) =>
                v.product.id !== product.id &&
                v.category.id === category.id &&
                best?.unitPrice &&
                v.best?.unitPrice?.basis === best.unitPrice.basis,
            )
            .sort((a, b) => a.best!.unitPrice!.cents - b.best!.unitPrice!.cents);
          return (
            <>
              <Stack.Screen options={{ title: category.name }} />
              <View style={{ gap: space.xs }}>
                <Text variant="heading">{product.name}</Text>
                <Text tone="textMuted">
                  {product.brandName}
                  {product.packaging ? ` · ${product.packaging}` : ''}
                </Text>
                {product.barcode ? (
                  <Text variant="small" tone="textSubtle" style={{ fontVariant: ['tabular-nums'] }}>
                    Code-barres {product.barcode} · comparé au {basisLabel[basis]}
                  </Text>
                ) : null}
                <View style={{ paddingTop: space.sm, gap: space.sm }}>
                  <FavoriteButton productId={product.id} />
                </View>
                <Link href={{ pathname: '/contribuer', params: { produit: product.id } }} asChild>
                  <Pressable accessibilityRole="link" style={{ paddingTop: space.sm }}>
                    <Text variant="small" tone="accentText" style={{ fontWeight: '700' }}>
                      Ajouter un prix pour ce produit
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {ranked.length > 0 ? (
                <View style={{ gap: space.md }}>
                  <Text variant="heading">Où l’acheter</Text>
                  <Text variant="small" tone="textSubtle">
                    Classé par prix au {basisLabel[basis]}, sur des prix constatés depuis moins de 30 jours.
                  </Text>
                  <MyStoresOffer ranked={ranked} />
                  {ranked.map((o, i) => (
                    <OfferCard key={o.observation.id} offer={o} rank={i + 1} best={best} asOf={asOf} />
                  ))}
                </View>
              ) : (
                <EmptyState title="Pas de classement possible">
                  <Text variant="small" tone="textMuted">
                    Aucun prix n’a été constaté récemment pour ce produit.
                  </Text>
                </EmptyState>
              )}

              {unranked.length > 0 ? (
                <View style={{ gap: space.md }}>
                  <Text variant="heading">Hors classement</Text>
                  <Text variant="small" tone="textSubtle">
                    Prix anciens ou estimés : à titre indicatif seulement.
                  </Text>
                  {unranked.map((o) => (
                    <OfferCard key={o.observation.id} offer={o} asOf={asOf} />
                  ))}
                </View>
              ) : null}

              <View style={{ gap: space.md }}>
                <Text variant="heading">Derniers relevés</Text>
                {history.map(({ store, points }) => (
                  <Card key={store.id}>
                    <Text variant="title">{store.name}</Text>
                    {[...points]
                      .reverse()
                      .slice(0, 5)
                      .map((p) => (
                        <View key={p.observedAt} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="small" tone="textMuted">
                            {formatDate(p.observedAt)}
                            {p.isPromo ? ' · promotion' : ''}
                          </Text>
                          <Text variant="small" style={{ fontVariant: ['tabular-nums'] }}>
                            {p.unitPriceCents === null
                              ? formatPrice(p.priceCents)
                              : formatUnitPrice({ basis, cents: p.unitPriceCents })}
                          </Text>
                        </View>
                      ))}
                  </Card>
                ))}
              </View>

              {alternatives.length > 0 ? (
                <View style={{ gap: space.md }}>
                  <Text variant="heading">Alternatives comparables</Text>
                  {alternatives.map((v) => (
                    <ProductCard key={v.product.id} view={v} asOf={asOf} />
                  ))}
                </View>
              ) : null}
            </>
          );
        }}
      </CatalogGate>
    </ScrollView>
  );
}

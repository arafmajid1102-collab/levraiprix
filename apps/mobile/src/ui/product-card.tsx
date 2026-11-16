import { formatPrice, formatRelativeDay, formatUnitPrice, type ProductView } from '@lvp/core';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Card, StatusBadge, Text } from './primitives';
import { space } from './theme';

export function ProductCard({ view, asOf }: { view: ProductView; asOf: Date }) {
  const { product, category, best, ranked, unranked } = view;
  return (
    <Link href={{ pathname: '/produit/[id]', params: { id: product.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${product.name}, ouvrir la fiche`}
        style={({ pressed }) => pressed && { opacity: 0.75 }}>
        <Card>
          <View style={{ gap: space.xxs }}>
            <Text variant="eyebrow" tone="textSubtle">
              {category.name}
            </Text>
            <Text variant="title">{product.name}</Text>
            <Text variant="small" tone="textSubtle">
              {product.brandName}
              {product.packaging ? ` · ${product.packaging}` : ''}
            </Text>
          </View>
          {best?.unitPrice ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text variant="price">{formatUnitPrice(best.unitPrice)}</Text>
                <Text variant="small" tone="textMuted" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatPrice(best.observation.priceCents)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
                <StatusBadge status={best.status} />
                <Text variant="caption" tone="textSubtle">
                  {best.store.retailerName} · {formatRelativeDay(best.observation.observedAt, asOf)} ·{' '}
                  {ranked.length} magasin{ranked.length > 1 ? 's' : ''}
                </Text>
              </View>
            </>
          ) : (
            <View style={{ gap: space.sm }}>
              {unranked[0] ? <StatusBadge status={unranked[0].status} /> : null}
              <Text variant="small" tone="textSubtle">
                Aucun prix constaté récemment : pas de classement possible.
              </Text>
            </View>
          )}
        </Card>
      </Pressable>
    </Link>
  );
}

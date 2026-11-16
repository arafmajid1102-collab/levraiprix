import { isValidGtin, normalizeBarcode } from '@lvp/core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { searchProductIds, useCatalog } from '@/lib/catalog';
import { ActionButton } from '@/ui/form';
import { EmptyState, Screen, Text } from '@/ui/primitives';
import { ProductCard } from '@/ui/product-card';
import { CatalogGate } from '@/ui/states';
import { fontSize, radius, space, useTheme } from '@/ui/theme';

export default function PricesScreen() {
  const { color } = useTheme();
  const catalog = useCatalog();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [matches, setMatches] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    searchProductIds(query, categoryId).then((ids) => !cancelled && setMatches(ids));
    return () => {
      cancelled = true;
    };
  }, [query, categoryId]);

  const code = normalizeBarcode(query);
  const looksLikeBarcode = code.length >= 8 && code.length === query.replace(/\s/g, '').length;

  return (
    <Screen>
      <Text variant="display">Prix</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Lessive, sacs-poubelle, ou code-barres…"
        placeholderTextColor={color.textSubtle}
        accessibilityLabel="Rechercher un produit ou saisir un code-barres"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={{
          backgroundColor: color.surface,
          borderColor: color.borderStrong,
          borderWidth: 1,
          borderRadius: radius.pill,
          paddingHorizontal: space.xl,
          paddingVertical: space.md,
          color: color.text,
          fontSize: fontSize.bodyLarge,
        }}
      />
      <ActionButton kind="secondary" label="Scanner un code-barres" onPress={() => router.push('/scanner')} />
      <CatalogGate catalog={catalog}>
        {({ categories, views, asOf }) => {
          const chips = [{ id: undefined as string | undefined, name: 'Toutes' }, ...categories];
          const barcodeHit = looksLikeBarcode ? views.filter((v) => v.product.barcode === code) : [];
          const results = barcodeHit.length ? barcodeHit : views.filter((v) => matches?.has(v.product.id));
          return (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {chips.map((c) => {
                  const selected = c.id === categoryId;
                  return (
                    <Pressable
                      key={c.id ?? 'all'}
                      onPress={() => setCategoryId(c.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        paddingHorizontal: space.lg,
                        paddingVertical: space.sm,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: selected ? 'transparent' : color.borderStrong,
                        backgroundColor: selected ? color.accentSoft : 'transparent',
                      }}>
                      <Text variant="small" tone={selected ? 'accentText' : 'textMuted'} style={{ fontWeight: '600' }}>
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {results.length > 0 ? (
                <View style={{ gap: space.md }}>
                  <Text variant="small" tone="textMuted">
                    {results.length} produit{results.length > 1 ? 's' : ''}
                  </Text>
                  {results.map((v) => (
                    <ProductCard key={v.product.id} view={v} asOf={asOf} />
                  ))}
                </View>
              ) : matches ? (
                <EmptyState title="Aucun produit trouvé">
                  <Text variant="small" tone="textMuted">
                    {looksLikeBarcode
                      ? isValidGtin(code)
                        ? `Le code-barres ${code} n’est pas encore dans le catalogue.`
                        : 'Ce code-barres n’est pas valide : vérifiez les chiffres.'
                      : 'Essayez un terme plus général, comme « lessive » ou « éponges ».'}
                  </Text>
                </EmptyState>
              ) : null}
            </>
          );
        }}
      </CatalogGate>
    </Screen>
  );
}

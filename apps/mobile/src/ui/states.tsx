import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import type { CatalogSnapshot, Loadable } from '@/lib/catalog';

import { EmptyState, Loading, Text } from './primitives';
import { radius, space, useTheme } from './theme';

export function Button({ label, onPress }: { label: string; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        backgroundColor: color.accent,
        paddingHorizontal: space.xl,
        paddingVertical: space.md,
        borderRadius: radius.pill,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text tone="onAccent" style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Gère chargement et erreur une fois pour tous les écrans qui lisent le catalogue. */
export function CatalogGate({
  catalog,
  children,
}: {
  catalog: Loadable<CatalogSnapshot>;
  children: (data: CatalogSnapshot) => ReactNode;
}) {
  if (catalog.state === 'loading') return <Loading />;
  if (catalog.state === 'error') {
    return (
      <EmptyState title="Impossible de charger les données">
        <Text variant="small" tone="textMuted">
          Vérifiez votre connexion, puis réessayez.
        </Text>
        <Button label="Réessayer" onPress={catalog.retry} />
      </EmptyState>
    );
  }
  return children(catalog.data);
}

export function ComingSoon({ title, intro, planned }: { title: string; intro: string; planned: string[] }) {
  return (
    <>
      <Text variant="display">{title}</Text>
      <Text tone="textMuted">{intro}</Text>
      <EmptyState title="Cette section n’est pas encore développée.">
        <Text variant="eyebrow" tone="textSubtle">
          Prévu en phase 4
        </Text>
        {planned.map((item) => (
          <Text key={item} variant="small" tone="textMuted">
            • {item}
          </Text>
        ))}
      </EmptyState>
    </>
  );
}

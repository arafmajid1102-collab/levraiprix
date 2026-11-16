import type { ThemeName } from '@lvp/design-system';
import { Pressable, View } from 'react-native';

import { useCatalog } from '@/lib/catalog';
import { AccountCard } from '@/ui/account-card';
import { MyStoresCard } from '@/ui/personal';
import { Card, Screen, Text } from '@/ui/primitives';
import { radius, space, useAppTheme } from '@/ui/theme';

const options: { value: ThemeName; label: string }[] = [
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
];

export default function ProfileScreen() {
  const { theme, setThemeName } = useAppTheme();
  const { color } = theme;
  const catalog = useCatalog();
  return (
    <Screen>
      <Text variant="display">Profil</Text>
      <Card>
        <Text variant="title">Apparence</Text>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', gap: space.xs, padding: space.xs, borderRadius: radius.pill, backgroundColor: color.bgSunken, alignSelf: 'flex-start' }}>
          {options.map(({ value, label }) => {
            const selected = theme.name === value;
            return (
              <Pressable
                key={value}
                onPress={() => setThemeName(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={{
                  paddingHorizontal: space.xl,
                  paddingVertical: space.sm,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? color.surfaceRaised : 'transparent',
                  borderWidth: 1,
                  borderColor: selected ? color.borderStrong : 'transparent',
                }}>
                <Text variant="small" tone={selected ? 'text' : 'textMuted'} style={{ fontWeight: '600' }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="small" tone="textSubtle">
          Ce choix vaut pour la session en cours ; il n’est pas encore mémorisé.
        </Text>
      </Card>
      <AccountCard />
      <MyStoresCard />
      <Card>
        <Text variant="title">Données affichées</Text>
        <Text variant="small" tone="textMuted">
          {catalog.state === 'ready'
            ? `${catalog.data.dataset.label} : ${catalog.data.views.length} produit${catalog.data.views.length > 1 ? 's' : ''}.${catalog.data.dataset.kind === 'demo' ? ' Aucune source de prix réelle n’est encore connectée.' : ''}`
            : 'Chargement…'}
        </Text>
      </Card>
    </Screen>
  );
}

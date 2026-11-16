import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/ui/theme';

/** Les cinq sections de l'application. Onglets natifs sur iOS et Android. */
export default function TabsLayout() {
  const { color } = useTheme();
  return (
    <NativeTabs
      backgroundColor={color.bgSunken}
      tintColor={color.accentText}
      iconColor={{ default: color.textSubtle, selected: color.accentText }}
      labelStyle={{ default: { color: color.textSubtle }, selected: { color: color.accentText } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Accueil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="prix">
        <NativeTabs.Trigger.Label>Prix</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stocks">
        <NativeTabs.Trigger.Label>Stocks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }} md="inventory_2" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="courses">
        <NativeTabs.Trigger.Label>Courses</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profil">
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

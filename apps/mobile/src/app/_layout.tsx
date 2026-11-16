import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AccountProvider } from '@/lib/account';
import { PersonalProvider } from '@/lib/personal';
import { AppThemeProvider, useTheme } from '@/ui/theme';

function Navigation() {
  const { name, color } = useTheme();
  const base = name === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          background: color.bg,
          card: color.bgSunken,
          text: color.text,
          border: color.border,
          primary: color.accentText,
        },
      }}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerBackTitle: 'Retour', headerTintColor: color.accentText }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="produit/[id]" options={{ title: 'Fiche produit' }} />
        <Stack.Screen name="connexion" options={{ title: 'Se connecter' }} />
        <Stack.Screen name="contribuer" options={{ title: 'Ajouter un prix' }} />
        <Stack.Screen name="scanner" options={{ title: 'Scanner un code-barres' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AccountProvider>
        <PersonalProvider>
          <Navigation />
        </PersonalProvider>
      </AccountProvider>
    </AppThemeProvider>
  );
}

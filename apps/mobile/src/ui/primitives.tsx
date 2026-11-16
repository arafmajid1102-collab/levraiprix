import {
  confidenceLabel,
  statusLabel,
  verdictLabel,
  type Confidence,
  type OfferVerdict,
  type PriceStatus,
} from '@lvp/core';
import type { ThemeColors } from '@lvp/design-system';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fontSize, radius, space, useTheme } from './theme';

type Variant = 'body' | 'small' | 'caption' | 'eyebrow' | 'title' | 'heading' | 'display' | 'price';
type Tone = keyof Pick<
  ThemeColors,
  'text' | 'textMuted' | 'textSubtle' | 'accentText' | 'good' | 'warn' | 'danger' | 'info' | 'highlight' | 'onAccent'
>;

const variants = StyleSheet.create({
  body: { fontSize: fontSize.body, lineHeight: 22 },
  small: { fontSize: fontSize.small, lineHeight: 19 },
  caption: { fontSize: fontSize.caption, lineHeight: 16, fontWeight: '600' },
  eyebrow: { fontSize: fontSize.caption, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: fontSize.bodyLarge, lineHeight: 23, fontWeight: '600' },
  heading: { fontSize: fontSize.heading, lineHeight: 31, fontWeight: '700', letterSpacing: -0.5 },
  display: { fontSize: fontSize.display, lineHeight: 40, fontWeight: '700', letterSpacing: -1 },
  price: { fontSize: fontSize.heading, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
});

export function Text({
  variant = 'body',
  tone = 'text',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const { color } = useTheme();
  return <RNText style={[variants[variant], { color: color[tone] }, style]} {...rest} />;
}

/** Écran défilant avec marges sûres et largeur de lecture maîtrisée. */
export function Screen({ children }: { children: ReactNode }) {
  const { color } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const { color } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: color.surface, borderColor: color.border }, style]}
      {...rest}
    />
  );
}

type BadgeTone = 'good' | 'danger' | 'warn' | 'info' | 'neutral' | 'muted';

function toneColors(color: ThemeColors, tone: BadgeTone) {
  switch (tone) {
    case 'good':
      return { fg: color.good, bg: color.goodSoft };
    case 'danger':
      return { fg: color.danger, bg: color.dangerSoft };
    case 'warn':
      return { fg: color.warn, bg: color.warnSoft };
    case 'info':
      return { fg: color.info, bg: color.infoSoft };
    case 'neutral':
      return { fg: color.text, bg: color.surfaceRaised };
    case 'muted':
      return { fg: color.textSubtle, bg: color.surfaceRaised };
  }
}

export function Badge({ label, tone, dashed }: { label: string; tone: BadgeTone; dashed?: boolean }) {
  const { color } = useTheme();
  const { fg, bg } = toneColors(color, tone);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderColor: fg, borderStyle: dashed ? 'dashed' : 'solid', borderWidth: dashed ? 1 : 0 },
      ]}>
      <RNText style={[variants.caption, { color: fg }]}>{label}</RNText>
    </View>
  );
}

const statusTone: Record<PriceStatus, BadgeTone> = {
  confirmed: 'good',
  observed: 'neutral',
  historical: 'muted',
  estimated: 'info',
};

/** Nature du prix — toujours affichée à côté d'un montant. */
export function StatusBadge({ status }: { status: PriceStatus }) {
  return <Badge label={statusLabel[status]} tone={statusTone[status]} dashed={status === 'estimated'} />;
}

const verdictTone: Record<OfferVerdict, BadgeTone> = {
  good_deal: 'good',
  fair: 'neutral',
  negligible: 'muted',
  misleading: 'danger',
  insufficient_data: 'muted',
};

export function VerdictBadge({ verdict }: { verdict: OfferVerdict }) {
  return <Badge label={verdictLabel[verdict]} tone={verdictTone[verdict]} />;
}

export function ConfidenceText({ confidence }: { confidence: Confidence }) {
  return (
    <Text variant="caption" tone="textSubtle">
      {confidenceLabel[confidence.level]}
    </Text>
  );
}

export function DemoNotice({ label }: { label: string }) {
  const { color } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: color.infoSoft }]} accessibilityRole="text">
      <Text variant="small" tone="info">
        <Text variant="small" tone="info" style={{ fontWeight: '700' }}>
          {label}.
        </Text>{' '}
        Marques, magasins et prix sont inventés ; aucun n’est un prix réel.
      </Text>
    </View>
  );
}

export function Loading() {
  const { color } = useTheme();
  return (
    <View style={styles.center} accessibilityLabel="Chargement">
      <ActivityIndicator color={color.accent} />
    </View>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  const { color } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: color.borderStrong }]}>
      <Text variant="title">{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: space.lg,
    paddingBottom: space.huge + space.xxxl,
    gap: space.xl,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  notice: { padding: space.md, borderRadius: radius.md },
  center: { padding: space.xxxl, alignItems: 'center' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.xl, gap: space.sm },
});

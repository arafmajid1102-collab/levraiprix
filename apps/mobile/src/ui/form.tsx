import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from './primitives';
import { fontSize, radius, space, useTheme } from './theme';

export function Field({ label, hint, style, ...rest }: TextInputProps & { label: string; hint?: string }) {
  const { color } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="small" style={{ fontWeight: '600' }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.textSubtle}
        selectionColor={color.accent}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          {
            backgroundColor: color.bgSunken,
            borderColor: color.borderStrong,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: fontSize.bodyLarge,
            color: color.text,
          },
          style,
        ]}
        {...rest}
      />
      {hint ? (
        <Text variant="caption" tone="textSubtle" style={{ fontWeight: '400' }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger';

export function ActionButton({
  label,
  onPress,
  kind = 'primary',
  disabled,
  stretch,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  stretch?: boolean;
}) {
  const { color } = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: stretch ? 'stretch' : 'flex-start',
        alignItems: 'center',
        backgroundColor: primary ? color.accent : 'transparent',
        borderWidth: 1,
        borderColor: primary ? color.accent : kind === 'danger' ? color.danger : color.borderStrong,
        paddingHorizontal: space.xl,
        paddingVertical: primary ? space.md : space.sm,
        borderRadius: radius.pill,
        opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
      })}>
      <Text
        variant={primary ? 'body' : 'small'}
        tone={primary ? 'onAccent' : kind === 'danger' ? 'danger' : 'text'}
        style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export type NoticeValue = { tone: 'error' | 'info' | 'good'; text: string } | null;

export function Notice({ notice }: { notice: NoticeValue }) {
  const { color } = useTheme();
  if (!notice) return null;
  const tones = {
    error: { fg: 'danger', bg: color.dangerSoft },
    info: { fg: 'info', bg: color.infoSoft },
    good: { fg: 'good', bg: color.goodSoft },
  } as const;
  const { fg, bg } = tones[notice.tone];
  return (
    <View
      accessibilityRole={notice.tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: bg, padding: space.md, borderRadius: radius.md }}>
      <Text variant="small" tone={fg}>
        {notice.text}
      </Text>
    </View>
  );
}

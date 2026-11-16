import {
  CODE_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  requestLoginCode,
  resendSignupCode,
  signInWithPassword,
  signUp,
  verifyCode,
  type AuthResult,
  type CodeKind,
} from '@lvp/data-supabase';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAccount } from '@/lib/account';
import { ActionButton, Field, Notice, type NoticeValue } from '@/ui/form';
import { Card, Loading, Screen, Text } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

type Mode = 'signin' | 'signup';
type Method = 'password' | 'code';

/** Connexion et création de compte : formulaire, puis saisie du code reçu par e-mail. */
export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  const account = useAccount();
  const { color } = useTheme();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'signin');
  const [method, setMethod] = useState<Method>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingCode, setPendingCode] = useState<CodeKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeValue>(null);

  const signedIn = account.status === 'signedIn';
  useEffect(() => {
    if (signedIn) router.replace('/profil');
  }, [signedIn, router]);

  const title = mode === 'signup' ? 'Créer un compte' : 'Se connecter';
  const header = <Stack.Screen options={{ title }} />;

  if (account.status === 'unavailable') {
    return (
      <Screen>
        {header}
        <Card>
          <Text variant="small" tone="textMuted">
            Les comptes ne sont pas disponibles en mode démonstration : aucune base de données n’est connectée.
          </Text>
        </Card>
      </Screen>
    );
  }
  if (account.status !== 'signedOut') {
    return (
      <Screen>
        {header}
        <Loading />
      </Screen>
    );
  }
  const { client } = account;

  async function run(action: () => Promise<AuthResult>, onOk?: () => void) {
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    if (result.ok) onOk?.();
    else setNotice({ tone: 'error', text: result.message });
    return result;
  }

  const askCode = (kind: CodeKind) => {
    setCode('');
    setPendingCode(kind);
  };

  async function submitForm() {
    if (mode === 'signup') {
      await run(() => signUp(client, email, password), () => askCode('signup'));
    } else if (method === 'code') {
      await run(() => requestLoginCode(client, email), () => askCode('login'));
    } else {
      const result = await run(() => signInWithPassword(client, email, password));
      // Compte créé mais jamais confirmé : on renvoie un code et on passe à la saisie.
      if (!result.ok && result.reason === 'unconfirmed') {
        await resendSignupCode(client, email);
        askCode('signup');
        setNotice({ tone: 'info', text: 'Votre adresse n’est pas encore confirmée : un nouveau code vient d’être envoyé.' });
      }
    }
  }

  // La session ouverte déclenche le retour au profil.
  const submitCode = () => run(() => verifyCode(client, email, code, pendingCode!));

  const resend = () =>
    run(
      () => (pendingCode === 'signup' ? resendSignupCode(client, email) : requestLoginCode(client, email)),
      () => setNotice({ tone: 'good', text: 'Un nouveau code a été envoyé. Seul le dernier code reçu est valable.' }),
    );

  if (pendingCode) {
    return (
      <Screen>
        {header}
        <Card>
          <Text variant="small" tone="textMuted">
            {pendingCode === 'signup' ? 'Si cette adresse n’a pas déjà de compte' : 'Si un compte existe pour cette adresse'}
            , un code à {CODE_LENGTH} chiffres vient d’être envoyé à {normalizeEmail(email)}. Il est valable une heure.
          </Text>
          <Field
            label="Code reçu par e-mail"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            autoFocus
            onSubmitEditing={submitCode}
            style={{ textAlign: 'center', letterSpacing: 8, fontVariant: ['tabular-nums'] }}
          />
          <Notice notice={notice} />
          <ActionButton label={busy ? 'Vérification…' : 'Valider le code'} onPress={submitCode} disabled={busy} stretch />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <ActionButton kind="secondary" label="Renvoyer un code" onPress={resend} disabled={busy} />
            <ActionButton
              kind="secondary"
              label="Changer d’adresse"
              disabled={busy}
              onPress={() => {
                setPendingCode(null);
                setNotice(null);
              }}
            />
          </View>
          <Text variant="small" tone="textMuted">
            Rien reçu ? Vérifiez les indésirables.{' '}
            {pendingCode === 'signup'
              ? 'Si vous aviez déjà un compte, revenez en arrière et connectez-vous.'
              : 'Si vous n’avez pas encore de compte, revenez en arrière et créez-le.'}
          </Text>
        </Card>
      </Screen>
    );
  }

  const withPassword = mode === 'signup' || method === 'password';
  const methods: [Method, string][] = [
    ['password', 'Mot de passe'],
    ['code', 'Code par e-mail'],
  ];
  return (
    <Screen>
      {header}
      <Card>
        {mode === 'signin' ? (
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', gap: space.xs, padding: space.xs, borderRadius: radius.pill, backgroundColor: color.bgSunken }}>
            {methods.map(([value, label]) => {
              const selected = method === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    setMethod(value);
                    setNotice(null);
                  }}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: space.sm,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    backgroundColor: selected ? color.surfaceRaised : 'transparent',
                    borderColor: selected ? color.borderStrong : 'transparent',
                  }}>
                  <Text variant="small" tone={selected ? 'text' : 'textMuted'} style={{ fontWeight: '600' }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <Field
          label="Adresse e-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
        />
        {withPassword ? (
          <Field
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            hint={mode === 'signup' ? `${PASSWORD_MIN_LENGTH} caractères au minimum.` : undefined}
            onSubmitEditing={submitForm}
          />
        ) : (
          <Text variant="small" tone="textMuted">
            Nous vous envoyons un code à usage unique. C’est aussi la solution si vous avez oublié votre mot de
            passe : vous pourrez en choisir un nouveau depuis votre profil.
          </Text>
        )}
        <Notice notice={notice} />
        <ActionButton
          stretch
          disabled={busy}
          onPress={submitForm}
          label={
            busy ? 'Un instant…' : mode === 'signup' ? 'Créer mon compte' : method === 'code' ? 'Recevoir un code' : 'Se connecter'
          }
        />
        {mode === 'signup' ? (
          <Text variant="small" tone="textMuted">
            Nous enregistrons uniquement votre adresse e-mail et votre mot de passe, qui n’est jamais conservé en
            clair. Vous pouvez exporter ou supprimer votre compte à tout moment depuis votre profil.
          </Text>
        ) : null}
        <ActionButton
          kind="secondary"
          disabled={busy}
          label={mode === 'signup' ? 'J’ai déjà un compte' : 'Créer un compte'}
          onPress={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setNotice(null);
          }}
        />
      </Card>
    </Screen>
  );
}
